/*

Copyright (c) 2010 Shahbaz Chaudhary

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.


*/

var net = require("net");
var events = require("events");
var sys = require("sys");
var logger = require("./lib/logger").createLogger();
var pipe = require("./lib/nodepipe");
var tags = require('./resources/fixtagnums').keyvals;


//static vars
var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;


net.createServer(function(stream){
    var pipeline = pipe.makePipe(stream);

    pipeline.addHandler(new FIXMsgWriter());    
    pipeline.addHandler(new FIXMsgCreator());
    pipeline.addHandler(new FIXFrameDecoder());
    pipeline.addHandler(new FIXParser());
    
    stream.setEncoding("utf8");
    
    stream.on("data", function(data){pipeline.pushIncoming({eventType:"data", data:data});}); 
    stream.on("end", function(){pipeline.pushIncoming({eventType:"end"});}); 
});

//Utility methods
var tag2txt = function(msg){ return Object.keys(msg).map(function(key){return tags[key]+"="+msg[key];}).join("|");}

logger.format = function(level, timestamp, message) {
  return [timestamp.getUTCFullYear() ,"/", timestamp.getUTCMonth() ,"/", timestamp.getUTCDay() , "-" , timestamp.getUTCHours() , ":" , timestamp.getUTCMinutes() , ":" , timestamp.getUTCSeconds() , "." , timestamp.getUTCMilliseconds() , " [" , level, "] ",  message].join("");
};

function checksum(str){
    var chksm = 0;
    for(var i=0; i<str.length; i++){
        chksm += str.charCodeAt(i);
    }
    
    chksm = chksm % 256;
    
    var checksumstr = "";
    if (chksm < 10) {
        checksumstr = "00" + chksm;
    }
    else if (chksm >= 10 && chksm < 100) {
        checksumstr = "0" + chksm;
    }
    else {
        checksumstr = "" + chksm;
    }
    
    return checksumstr;
}

//Protocol handlers

function FIXFrameDecoder(){
    this.description = "fix frame decoder: accepts raw text, creates messages";
    this.databuffer = "";
    var self = this;
    
    this.incoming = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.next(event);
        }
        
        var stream = ctx.stream;
        
        self.databuffer += event.data;
        while (self.databuffer.length > 0) {
            //====Step 1: Extract complete FIX message====
            //If we don't have enough data to start extracting body length, wait for more data
            if (databuffer.length <= ENDOFTAG8) {
                return;
            }

            var _idxOfEndOfTag9Str = databuffer.substring(ENDOFTAG8).indexOf(SOHCHAR);
            var idxOfEndOfTag9 = parseInt(_idxOfEndOfTag9Str, 10) + ENDOFTAG8;

            if (isNaN(idxOfEndOfTag9)) {
                logger.error("[ERROR] Unable to find the location of the end of tag 9. Message probably misformed: " + databuffer.toString());
                stream.end();
                return;
            }


            //If we don't have enough data to stop extracting body length AND we have received a lot of data
            //then perhaps there is a problem with how the message is formatted and the session should be killed
            if (idxOfEndOfTag9 < 0 && databuffer.length > 100) {
                logger.error("[ERROR] Over 100 character received but body length still not extractable.  Message probably misformed: " + databuffer.toString());
                stream.end();
                return;
            }


            //If we don't have enough data to stop extracting body length, wait for more data
            if (idxOfEndOfTag9 < 0) {
                return;
            }

            var _bodyLengthStr = databuffer.substring(STARTOFTAG9VAL, idxOfEndOfTag9);
            var bodyLength = parseInt(_bodyLengthStr, 10);
            if (isNaN(bodyLength)) {
                logger.error("[ERROR] Unable to parse bodyLength field. Message probably misformed: " + databuffer.toString());
                stream.end();
                return;
            }

            var msgLength = bodyLength + idxOfEndOfTag9 + SIZEOFTAG10;

            //If we don't have enough data for the whole message, wait for more data
            if (databuffer.length < msgLength) {
                return;
            }

            var msg = databuffer.substring(0, msgLength);
            if (msgLength == databuffer.length) {
                databuffer = "";
            }
            else {
                var debugstr = databuffer.substring(msgLength);
                //logger.info("[DEBUG] debugstr:" + debugstr);
                databuffer = debugstr;
            }

            logger.info("FIX in: " + msg);
            ctx.next({eventType:"data",data:msg});
        }
    }
}

function FIXParser(){
    this.description = "fix parser: accepts fix messages, creates key/tag vals";
    this.incoming = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.next(event);
        }
        
        var msg = event.data;
        var stream = ctx.stream;
        
        //====Step 2: Validate message====
            var calculatedChecksum = checksum(msg.substr(0,msg.length - 7));
            var extractedChecksum = msg.substr(msg.length - 4, 3);
            
            if (calculatedChecksum !== extractedChecksum) {
                logger.warn("[WARNING] Discarding message because body length or checksum are wrong (expected checksum: "+calculatedChecksum+"): " + msg);
                continue;
            }

            //====Step 3: Convert to map====
            var keyvals = msg.split(SOHCHAR);
            //sys.debug("keyvals:"+keyvals);
            var fix = {};
            for (var kv in Object.keys(keyvals)) {
                //if (keyvals.hasOwnProperty(kv)) {
                    var kvpair = keyvals[kv].split("=");
                    fix[kvpair[0]] = kvpair[1];
                //}
            }

            //====Step 4: Confirm all required fields are available====
            for (var f in Object.keys(headers)) {
                //if (headers.hasOwnProperty(f)) {
                    var tag = headers[f];
                    if (tag.charAt(tag.length - 1) != "?" && fix[tag] === undefined) { //If tag is required, but missing
                        logger.error("[ERROR] tag " + tag + " is required but missing in incoming message: " + msg);
                        if (loggedIn) {
                            ctx.reverse({
                                "35": "3",
                                "45": fix[tags["MsgSeqNum"]],
                                "58": "MissingTags"
                            }); /*write session reject*/
                        }
                        else {
                            stream.end();
                            return;
                        }
                    }
                //}
            }

            for (var f in Object.keys(trailers)) {
                //if (trailers.hasOwnProperty(f)) {
                    var tag = trailers[f];
                    if (tag.charAt(tag.length - 1) != "?" && fix[tag] === undefined) { //If tag is required, but missing
                        logger.error("[ERROR] tag " + tag + " is required but missing in incoming message: " + msg);
                        if (loggedIn) {
                            ctx.reverse({
                                "35": "3",
                                "45": fix[tags["MsgSeqNum"]],
                                "58": "MissingTags"
                            }); /*write session reject*/
                        }
                        else {
                            stream.end();
                            return;
                        }
                    }
                //}
            }

            //====Step 5: Confirm first message is a logon message and it has a heartbeat
            var msgType = fix[tags["MsgType"]];
            if (!loggedIn && msgType != "A") {
                logger.error("[ERROR] Logon message expected, received message of type " + msgType);
                stream.end();
                return;
            }

            if (msgType == "A" && fix[tags["HeartBtInt"]] === undefined) {
                logger.error("[ERROR] Logon does not have tag 108 (heartbeat) ");
                stream.end();
                return;
            }


            //====Step 6: Confirm incoming sequence number====
            var _seqNum = parseInt(fix[tags["MsgSeqNum"]], 10);
            if(fix[tags["MsgType"]]==="4" /*seq reset*/ && (fix[tags["GapFillFlag"]] === undefined || fix[tags["GapFillFlag"]] === "N")){
                logger.warn("Requence Reset request received: " + msg);
                var resetseqno = parseInt(fix[tags["NewSeqNo"]],10);
                if(resetseqno <= incomingSeqnum){
                    //TODO: Reject, sequence number may only be incremented
                }
                else{
                    incomingSeqNum = resetseqno;                
                }
            }
            if (loggedIn && _seqNum == incomingSeqNum) {
                incomingSeqNum++;
                resendRequested = false;
            }
            else if (loggedIn && _seqNum < incomingSeqNum) {
                var posdup = fix[tags["PossDupFlag"]];
                if(posdup !== undefined && posdup === "Y"){
                    logger.warn("This posdup message's seqno has already been processed. Ignoring: "+msg);
                }
                logger.error("[ERROR] Incoming sequence number lower than expected. No way to recover:"+msg);
                stream.end();
                return;
            }
            else if (loggedIn && _seqNum > incomingSeqNum) {
                //Missing messages, write resend request and don't process any more messages
                //until the rewrite request is processed
                //set flag saying "waiting for rewrite"
                if(resendRequested !== true){
                    resendRequested = true;
                    ctx.reverse({"35":2, "7":incomingSeqNum, "8":0});
                }
            }

            //====Step 7: Confirm compids and fix version match what was in the logon msg
            var incomingFixVersion = fix[tags["BeginString"]];
            var incomingsenderCompID = fix[tags["TargetCompID"]];
            var incomingTargetCompID = fix[tags["SenderCompID"]];

            if (loggedIn && (fixVersion != incomingFixVersion || senderCompID != incomingsenderCompID || targetCompID != incomingTargetCompID)) {
                logger.warn("[WARNING] Incoming fix version (" + incomingFixVersion + "), sender compid (" + incomingsenderCompID + ") or target compid (" + incomingTargetCompID + ") did not match expected values (" + fixVersion + "," + senderCompID + "," + targetCompID + ")"); /*write session reject*/
            }
            
            
            //===Step 8: Record incoming message -- might be needed during resync
            if(loggedIn){
                datastore.add(fix);
                //addInMsg(targetCompID, fix);
            }
            logger.debug("FIXMAP in: " + tag2txt(fix));
            


            //====Step 9: Messages
            switch (msgType) {
                case "0":
                    //handle heartbeat; break;
                    break;
                case "1":
                    //handle testrequest; break;
                    var testReqID = fix[tags["TestReqID"]];
                    ctx.reverse({
                        "35": "0",
                        "112": testReqID
                    }); /*write heartbeat*/
                    break;
                case "2":
                    var beginSeqNo = parseInt(fix[tags["BeginSeqNo"]],10);
                    var endSeqNo = parseInt(fix[tags["EndSeqNo"]],10);
                    outgoingSeqNum = beginSeqNo;
                    var outmsgs = getOutMessages(targetCompID, beginSeqNo, endSeqNo);
                    for(var k in outmsgs){
                        var resendmsg = msgs[k];
                        resendmsg[tags["PossDupFlag"]] = "Y"; 
                        resendmsg[tags["OrigSendingTime"]] = resendmsg["SendingTime"];
                        ctx.reverse(resendmsg);
                    }
                    //handle resendrequest; break;
                    break;
                case "3":
                    //handle sessionreject; break;
                    break;
                case "4":
                    //Gap fill mode
                    if(fix[tags["GapFillFlag"]] === "Y"){
                        var newSeqNo = parseInt(fix[tags["NewSeqNo"]],10);
                        
                        if(newSeqNo <= incomingSeqNo){
                            //TODO: Reject, sequence number may only be incremented
                        }
                        else{
                            incomingSeqNo = newSeqNo;                    
                        }
                    }
                    break;
                    //Reset mode
                    //Reset mode is handled in step 6, when confirming incoming seqnums
                    //handle seqreset; break;
                case "5":
                    //handle logout; break;
                    ctx.reverse({
                        "35": "5"
                    }); /*write a logout ack right back*/
                    break;
                case "A":
                    //handle logon; break;
                    fixVersion = fix[tags["BeginString"]];
                    senderCompID = fix[tags["TargetCompID"]];
                    targetCompID = fix[tags["SenderCompID"]];

                    //create data store
                    datastore = new Dirty(senderCompID + '-' + targetCompID + '-' + fixVersion + '.dat');
                    datastore.add(fix);

                    heartbeatDuration = parseInt(fix[tags["HeartBtInt"]], 10) * 1000;
                    loggedIn = true;
                    heartbeatIntervalID = setInterval(heartbeatCallback, heartbeatDuration);
                    //heartbeatIntervalIDs.push(intervalID);
                    this.emit("logon", targetCompID,stream);
                    logger.info(fix[tags["SenderCompID"]] + " logged on from " + stream.remoteAddress);
                    
                    if(isInitiator === true){
                        ctx.reverse({
                            "35": "A",
                            "108": fix[tags["HeartBtInt"]]
                        }); /*write logon ack*/
                    }
                    break;
                default:
            }
            ctx.next({eventType:"data", data:fix});
    }
}

function FIXMsgCreator(){
    this.description = "converts key/val map to fix string with correct checksum";
    
    this.outgoing = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.next(event);
        }
        
        var msg = event.data;
        var stream = ctx.stream;
        
        var senderCompIDExtracted = msg[tags["TargetCompID"]];
        var targetCompIDExtracted = msg[tags["SenderCompID"]];

        delete msg[tags["BodyLength"]]; //bodylength
        delete msg[tags["CheckSum"]]; //checksum
        delete msg[tags["SendingTime"]]; //timestamp
        delete msg[tags["BeginString"]]; //fixversion
        delete msg[tags["TargetCompID"]]; //sendercompid
        delete msg[tags["SenderCompID"]]; //targetcompid
        delete msg[tags["MsgSeqNum"]]; //seqnum
        var headermsgarr = [];
        for (var f in Object.keys(headers)) {
            //if (headers.hasOwnProperty(f)) {
                var tag = headers[f];

                if (tag == "8" || tag == "9" || tag == "59" || tag == "52" || tag == "56" || tag == "49" || tag == "34") {
                    continue;
                }

                if (tag.charAt(tag.length - 1) != "?" && msg[tag] === undefined) { //If tag is required, but missing
                    logger.error("[ERROR] tag " + tag + " is required but missing in outgoing message: " + msg);
                    return;
                }

                if (msg[tag] !== undefined) {
                    headermsgarr.push(tag, "=", msg[tag], SOHCHAR);
                    delete msg[tag];
                }
            //}
        }

        var timestamp = new Date();
        headermsgarr.push("52=" , timestamp.getUTCFullYear() , timestamp.getUTCMonth() , timestamp.getUTCDay() , "-" , timestamp.getUTCHours() , ":" , timestamp.getUTCMinutes() , ":" , timestamp.getUTCSeconds() , "." , timestamp.getUTCMilliseconds() , SOHCHAR);
        headermsgarr.push("56=" , (senderCompIDExtracted || senderCompID) , SOHCHAR);
        headermsgarr.push("49=" , (targetCompIDExtracted || targetCompID) , SOHCHAR);
        headermsgarr.push("34=" , (outgoingSeqNum++) , SOHCHAR);

        var trailermsgarr = [];
        for (var f in Object.keys(trailers)) {
            //if (trailers.hasOwnProperty(f)) {
                var tag = trailers[f];

                if (tag == "10") {
                    continue;
                }

                if (tag.charAt(tag.length - 1) != "?" && msg[tag] === undefined) { //If tag is required, but missing
                    logger.error("[ERROR] tag " + tag + " is required but missing in outgoing message: " + msg);
                    return;
                }

                if (msg[tag] !== undefined) {
                    trailermsgarr.push(tag , "=" , msg[tag] , SOHCHAR);
                    delete msg[tag];
                }

            //}
        }

        var bodymsgarr = [];
        for (var tag in msg) {
            if (msg.hasOwnProperty(tag)) {
                bodymsgarr.push( tag , "=" , msg[tag] , SOHCHAR);
            }
        }

        var headermsg = headermsgarr.join("");
        var trailermsg = trailermsgarr.join("");
        var bodymsg = bodymsgarr.join("");
        
        var outmsgarr = [];
        outmsgarr.push( "8=" , fixVersion , SOHCHAR);
        outmsgarr.push( "9=" , (headermsg.length + bodymsg.length + trailermsg.length) , SOHCHAR);
        outmsgarr.push( headermsg);
        outmsgarr.push( bodymsg);
        outmsgarr.push( trailermsg);
        
        var outmsg = outmsgarr.join("");

        outmsg += "10=" + checksum(outmsg) + SOHCHAR;

        logger.info("FIX out:" + outmsg);
        timeOfLastOutgoing = new Date().getTime();

        //addOutMsg(targetCompID, outmsg);

        stream.write(outmsg);
    }
}

function FIXMsgWriter(){
    this.description = "writes fix string to stream";
    
    this.outgoing = function(ctx, event){
        
        if(event.eventType !== "data"){
            ctx.next(event);
        }
        
        ctx.stream.write(event.data);

    }
}
