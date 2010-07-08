//TODO:
//Server should keep track of who is logged on
//Allow server to send messages to individual connections
//Check duplicate senderCompIDs
//Grouped fields
//Drop copy
//expire messages (for resend, send gap fill instead)

//DOING:
//Web control

var net = require("net");
var events = require("events");
var sys = require("sys");
var logger = require('../node-logger/logger').createLogger();
var fixtagnums = require('./resources/fixtagnums').keyvals;


//logger.setLevel('debug');


//Message container
//{targetCompiD:{incoming:[], outgoing:[]}}
var msgContainer = {};

function addInMsg(target, msg){
    var tgt = msgContainer[target];
    if(tgt === undefined){
        msgContainer[target] = {incoming:[msg], outgoing:[]};
    }
    else{
        msgContainer[target].incoming.push(msg);
    }
}

function addOutMsg(target, msg){
    var tgt = msgContainer[target];
    if(tgt === undefined){
        msgContainer[target] = {incoming:[], outgoing:[msg]};
    }
    else{
        msgContainer[target].outgoing.push(msg);
    }
}

function getInMessages(target, beginSeqNo, endSeqNo){
    var tgt = msgContainer[target];
    if(tgt === undefined){
        return [];
    }
    else{
        var msgs = tgt.incoming;
        var msgsarr = [];
        for(var k in msgs){
            var msg = msgs[k];
            var seqNo = parseInt(msg["34"],10);
            if(seqNo >= beginSeqNo && seqNo <= endSeqNo){
                msgarr.push(msg);
            }
        }
    }
}

function getOutMessages(target, beginSeqNo, endSeqNo){
    var tgt = msgContainer[target];
    if(tgt === undefined){
        return [];
    }
    else{
        var msgs = tgt.outgoing;
        var msgsarr = [];
        for(var k in msgs){
            var msg = msgs[k];
            var seqNo = parseInt(msg["34"],10);
            if(seqNo >= beginSeqNo && seqNo <= endSeqNo){
                msgarr.push(msg);
            }
        }
    }
}

//Utility methods

function tag2txt = function(msg){ return Object.keys(msg).map(function(key){return fixtagnums[key]+"="+msg[key];}).join("|");}

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

//static vars
var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;



function Session(stream, isInitiator,  opt) {
    events.EventEmitter.call(this);
    var self = this;

    stream.setEncoding("ascii");
    stream.setTimeout(1000);
    

    this.stream = stream;
    var fixVersion = opt.version;
    var headers = opt.headers;
    var trailers = opt.trailers;
    

    //session vars
    var senderCompID = ""; //senderCompID || "";
    var targetCompID = ""; //targetCompID || "";
    var heartbeatDuration = 0;

    var databuffer = "";
    var charlen = 0;

    var loggedIn = false;
    var incomingSeqNum = 1;
    var outgoingSeqNum = 1;
    var timeOfLastIncoming = 0;
    var timeOfLastOutgoing = 0;
    var resendRequested = false;

    var heartbeatIntervalID ;
    

    this.addListener("end", function () {
        clearInterval(heartbeatIntervalID);
        this.emit("logoff", targetCompID);
    });
    

    var heartbeatCallback = function () {

        var currentTime = new Date().getTime();

        if (currentTime - timeOfLastOutgoing > heartbeatDuration) {
            writefix({
                "35": "0"
            }); /*write heartbeat*/
        }

        if (currentTime - timeOfLastIncoming > heartbeatDuration * 1.5) {
            writefix({
                "35": "1",
                "112": outgoingSeqNum + ""
            }); /*write testrequest*/
        }

        if (currentTime - timeOfLastIncoming > heartbeatDuration * 3) {
            logger.error("[ERROR] No message received from counterparty and no response to test request.");
            stream.end();
            return;
        }
    };


    
    //Used for parsing outgoing data -------------------------------
    //this.write = function(msg){ writefix(msg);};
    function writefix(msg) {

        var senderCompIDExtracted = msg["56"];
        var targetCompIDExtracted = msg["49"];

        delete msg["9"]; //bodylength
        delete msg["10"]; //checksum
        delete msg["52"]; //timestamp
        delete msg["8"]; //fixversion
        delete msg["56"]; //sendercompid
        delete msg["49"]; //targetcompid
        delete msg["34"]; //seqnum
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

        addOutMsg(targetCompID, outmsg);

        stream.write(outmsg);
    }

    this.write = writefix;


    //Used for parsing incoming data -------------------------------
    function handlefix(data){
    
        //logger.info("++++++++data received: " + data);

        //Add data to the buffer (to avoid processing fragmented TCP packets)
        databuffer = databuffer + data;
        timeOfLastIncoming = new Date().getTime();

        while (databuffer.length > 0) {
            //logger.info("-------NEW LOOP:" + databuffer.length + ":" + databuffer);

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
                            writefix({
                                "35": "3",
                                "45": fix["34"],
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
                            writefix({
                                "35": "3",
                                "45": fix["34"],
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
            var msgType = fix["35"];
            if (!loggedIn && msgType != "A") {
                logger.error("[ERROR] Logon message expected, received message of type " + msgType);
                stream.end();
                return;
            }

            if (msgType == "A" && fix["108"] === undefined) {
                logger.error("[ERROR] Logon does not have tag 108 (heartbeat) ");
                stream.end();
                return;
            }


            //====Step 6: Confirm incoming sequence number====
            var _seqNum = parseInt(fix["34"], 10);
            if(fix["35"]==="4" /*seq reset*/ && (fix["123"] === undefined || fix["123"] === "N")){
                logger.warn("Requence Reset request received: " + msg);
                var resetseqno = parseInt(fix["36"],10);
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
                var posdup = fix["43"];
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
                    writefix({"35":2, "7":incomingSeqNum, "8":0});
                }
            }

            //====Step 7: Confirm compids and fix version match what was in the logon msg
            var incomingFixVersion = fix["8"];
            var incomingsenderCompID = fix["56"];
            var incomingTargetCompID = fix["49"];

            if (loggedIn && (fixVersion != incomingFixVersion || senderCompID != incomingsenderCompID || targetCompID != incomingTargetCompID)) {
                logger.warn("[WARNING] Incoming fix version (" + incomingFixVersion + "), sender compid (" + incomingsenderCompID + ") or target compid (" + incomingTargetCompID + ") did not match expected values (" + fixVersion + "," + senderCompID + "," + targetCompID + ")"); /*write session reject*/
            }
            
            
            //===Step 8: Record incoming message -- might be needed during resync
            addInMsg(targetCompID, fix);
            logger.debug("FIXMAP in: " + tag2txt(fix));
            


            //====Step 9: Messages
            switch (msgType) {
            case "0":
                //handle heartbeat; break;
                break;
            case "1":
                //handle testrequest; break;
                var testReqID = fix["112"];
                writefix({
                    "35": "0",
                    "112": testReqID
                }); /*write heartbeat*/
                break;
            case "2":
                var beginSeqNo = parseInt(fix["7"],10);
                var endSeqNo = parseInt(fix["16"],10);
                outgoingSeqNum = beginSeqNo;
                var outmsgs = getOutMessages(targetCompID, beginSeqNo, endSeqNo);
                for(var k in outmsgs){
                    var resendmsg = msgs[k];
                    resendmsg["43"] = "Y"; 
                    resendmsg["122"] = resendmsg["52"];
                    writefix(resendmsg);
                }
                //handle resendrequest; break;
                break;
            case "3":
                //handle sessionreject; break;
                break;
            case "4":
                //Gap fill mode
                if(fix["123"] === "Y"){
                    var newSeqNo = parseInt(fix["36"],10);
                    
                    if(newSeqNo <= incomingSeqNo){
                        //TODO: Reject, sequence number may only be incremented
                    }
                    else{
                        incomingSeqNo = newSeqNo;                    
                    }
                }
                //Reset mode
                //Reset mode is handled in step 6, when confirming incoming seqnums
                //handle seqreset; break;
            case "5":
                //handle logout; break;
                writefix({
                    "35": "5"
                }); /*write a logout ack right back*/
                break;
            case "A":
                //handle logon; break;
                fixVersion = fix["8"];
                senderCompID = fix["56"];
                targetCompID = fix["49"];
                heartbeatDuration = parseInt(fix["108"], 10) * 1000;
                loggedIn = true;
                heartbeatIntervalID = setInterval(heartbeatCallback, heartbeatDuration);
                //heartbeatIntervalIDs.push(intervalID);
                this.emit("logon", targetCompID,stream);
                logger.info(fix["49"] + " logged on from " + stream.remoteAddress);
                
                if(isInitiator === true){
                    writefix({
                        "35": "A",
                        "108": fix["108"]
                    }); /*write logon ack*/
                }
                break;
            default:
            }
            this.emit("data", fix);
        }

    }
    
    this.handle = handlefix;
    //this.handleTest = function(){ return handlefix;};

    //this.addListener("data", handlefix);


}
sys.inherits(Session, events.EventEmitter);
//Session.prototype.write = function(msg){ this.writefix(msg);};


//---------------------SERVER
function Server() {
    events.EventEmitter.call(this);
    this.clients = {};
    //this.addListener("logon", function(client,stream) { clients[client]=stream; } );
    
}
sys.inherits(Server, events.EventEmitter);
Server.prototype.listen = function (port) { this.socket.listen(port); };
Server.prototype.write = function(client, msg) { this.clients[client].write(msg); };
Server.prototype.end = function(client){ this.clients[client].end(); };

//---------------------CLIENT
function Client(senderCompID, targetCompID, opt) {
    events.EventEmitter.call(this);

}
sys.inherits(Client, events.EventEmitter);
Client.prototype.end = function () { this.socket.end(); };



//---------------------EXPORTS
//events: connect, end, data, logon
exports.createServer = function (opt, func) {

    var server = new Server();

    server.socket = net.createServer(function (stream) {
        var session = new Session(stream, true, opt);
        func(session);

        stream.addListener("connect", function () {
            session.emit("connect");
        });

        stream.addListener("end", function () {
            stream.end();
            session.emit("end");
        });

        stream.addListener("data", function(data){session.handle(data);});
        
        session.addListener("logon", function(client,strm){
                server.clients[client]=strm; 
                sys.log("------"+ Object.keys(server.clients));
            }
        );
        session.addListener("logoff", function(client){
                delete server.clients[client];
            }
        );

    });

    return server;
};

exports.createConnection = function (senderCompID, targetCompID, heartbeatseconds, opt, port, host) {

    var client = new Client(senderCompID, targetCompID, opt);

    var stream = net.createConnection(port, host);

    var session = new Session(stream, false, opt);

    client.stream = stream;
    stream.addListener("connect", function () {
        session.emit("connect");
        session.write({
            "35": "A",
            "49": senderCompID,
            "56": targetCompID,
            "108": heartbeatseconds,
            "98": 0
        });
    });
    stream.addListener("end", function () {
        session.emit("end");
    });

    stream.addListener("data", function(data){session.handle(data);});

    return session;
};




//Copyright 2010 Shahbaz Chaudhary (shahbazc@gmail.com)
//Not for public release
//Not publicly lisenced
