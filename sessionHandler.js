//static vars
var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;

var buffer = "";

function sessionHandler(stream){
	this.buffer = "";
	this.timeOfLastOutgoing;
	this.timeOfLastIncoming;
	self = this;
	
	this.toSender = function(msg){

        delete msg["8"]; //fixversion
        delete msg["9"]; //bodylength
        delete msg["10"]; //checksum
        delete msg["52"]; //timestamp
        delete msg["49"]; //sendercompid
        delete msg["56"]; //targetcompid
        delete msg["34"]; //seqnum
        
        var timestamp = new Date();
        var headermsgarr = [];
        var bodymsgarr = [];
        var trailermsgarr = [];
        
        headermsgarr.push("52=" , getUTCTimeStamp(timestamp) , SOHCHAR);
        headermsgarr.push("56=" , (ctx.state.senderCompID) , SOHCHAR); // TODO compid should be available from the context object, if extracted compid doesn't match the one in ctx, it is an error
        headermsgarr.push("49=" , (ctx.state.targetCompID) , SOHCHAR);
        headermsgarr.push("34=" , (ctx.state.outgoingSeqNum++) , SOHCHAR);
        
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
        
        console.log("FIX out: " + outmsg);
        timeOfLastOutgoing = timestamp.getTime();
        //TODO stream.sendMsg(outmsg);
	}
	
	this.onData = function(data){
	    buffer += data;
	    
	    while(buffer.length > 0){
	        //====================================Step 1: Extract complete FIX message====================================

	        //If we don't have enough data to start extracting body length, wait for more data
	        if (buffer.length <= ENDOFTAG8) {
	            return;
	        }

	        var _idxOfEndOfTag9Str = buffer.substring(ENDOFTAG8).indexOf(SOHCHAR);
	        var idxOfEndOfTag9 = parseInt(_idxOfEndOfTag9Str, 10) + ENDOFTAG8;

	        if (isNaN(idxOfEndOfTag9)) {
	            console.log("[ERROR] Unable to find the location of the end of tag 9. Message probably misformed: " 
	                + buffer.toString());
	            stream.end();
	            return;
	        }


	        //If we don't have enough data to stop extracting body length AND we have received a lot of data
	        //then perhaps there is a problem with how the message is formatted and the session should be killed
	        if (idxOfEndOfTag9 < 0 && buffer.length > 100) {
	            console.log("[ERROR] Over 100 character received but body length still not extractable.  Message misformed: " 
	                + databuffer.toString());
	            stream.end();
	            return;
	        }


	        //If we don't have enough data to stop extracting body length, wait for more data
	        if (idxOfEndOfTag9 < 0) {
	            return;
	        }

	        var _bodyLengthStr = buffer.substring(STARTOFTAG9VAL, idxOfEndOfTag9);
	        var bodyLength = parseInt(_bodyLengthStr, 10);
	        if (isNaN(bodyLength)) {
	            console.log("[ERROR] Unable to parse bodyLength field. Message probably misformed: bodyLength='" 
	                + _bodyLengthStr + "', msg=" + buffer.toString());
	            stream.end();
	            return;
	        }

	        var msgLength = bodyLength + idxOfEndOfTag9 + SIZEOFTAG10 ;

	        //If we don't have enough data for the whole message, wait for more data
	        if (buffer.length < msgLength) {
	            return;
	        }

	        //Message received!
	        var msg = buffer.substring(0, msgLength);
	        if (msgLength == buffer.length) {
	            buffer = "";
	        }
	        else {
	            var remainingBuffer = buffer.substring(msgLength);
	            buffer = remainingBuffer;
	        }

	        console.log("FIX in: " + msg);

	        //====================================Step 2: Validate message====================================

	        var calculatedChecksum = checksum(msg.substr(0, msg.length - 7));
	        var extractedChecksum = msg.substr(msg.length - 4, 3);

	        if (calculatedChecksum !== extractedChecksum) {
	            logger.warn("[WARNING] Discarding message because body length or checksum are wrong (expected checksum: " 
	                + calculatedChecksum + ", received checksum: " + extractedChecksum + "): [" + msg + "]");
	            return;
	        }

	        //====================================Step 3: Convert to map====================================

	        var keyvals = msg.split(SOHCHAR);
	        var fix = {};
	        for (var kv in Object.keys(keyvals)) {
	            var kvpair = keyvals[kv].split("=");
	            fix[kvpair[0]] = kvpair[1];
	        }

	        //====================================Step 4: Confirm all required fields are available====================================
	        //TODO do this differently

	        //====================================Step 5: Confirm first message is logon and it has a heartbeat========================

	        var msgType = fix["35"];
	        
	        if(!loggedIn && msgType != "A"){
	            console.log("[ERROR] Logon message expected, received message of type " + msgType + ", [" + msg + "]");
	            stream.end();
	            return;
	        }

	        if (msgType == "A" && fix["108"] === undefined) {
	            logger.error("[ERROR] Logon does not have tag 108 (heartbeat) ");
	            stream.end();
	            return;
	        }

	        //====================================Step 6: Confirm incoming sequence numbers========================
	        var _seqNum = parseInt(fix["34"], 10);
	        if(fix["35"]==="4" /*seq reset*/ && (fix["123"] === undefined || fix["123"] === "N")){
	            logger.warn("Requence Reset request received: " + msg);
	            var resetseqno = parseInt(fix["36"],10);
	            if(resetseqno <= ctx.state.incomingSeqnum){
	            //TODO: Reject, sequence number may only be incremented
	            }
	            else{
	                ctx.state.incomingSeqNum = resetseqno;
	            }
	        }
	        if (ctx.state.loggedIn && _seqNum == ctx.state.incomingSeqNum) {
	            ctx.state.incomingSeqNum++;
	            ctx.state.resendRequested = false;
	        }
	        else if (ctx.state.loggedIn && _seqNum < ctx.state.incomingSeqNum) {
	            var posdup = fix["43"];
	            if(posdup !== undefined && posdup === "Y"){
	                logger.warn("This posdup message's seqno has already been processed. Ignoring: "+msg);
	            }
	            logger.error("[ERROR] Incoming sequence number lower than expected. No way to recover:"+msg);
	            stream.end();
	            return;
	        }
	        else if (ctx.state.loggedIn && _seqNum > ctx.state.incomingSeqNum) {
	            //Missing messages, write resend request and don't process any more messages
	            //until the rewrite request is processed
	            //set flag saying "waiting for rewrite"
	            if(ctx.state.resendRequested !== true){
	                ctx.state.resendRequested = true;
	                ctx.sendPrev({
	                    "35":2,
	                    "7":ctx.state.incomingSeqNum,
	                    "8":0
	                });
	            }
	        }

	        //====================================Step 7: Confirm compids and fix version are correct========================

	        var incomingFixVersion = fix["8"];
	        var incomingsenderCompID = fix["56"];
	        var incomingTargetCompID = fix["49"];

	        if (loggedIn && 
	            (fixVersion != incomingFixVersion || senderCompID != incomingsenderCompID || targetCompID != incomingTargetCompID)) {
	                console.log("[WARNING] Incoming fix version (" + 
	                    incomingFixVersion + 
	                    "), sender compid (" + 
	                    incomingsenderCompID + 
	                    ") or target compid (" + 
	                    incomingTargetCompID + 
	                    ") did not match expected values (" + 
	                    fixVersion + "," + senderCompID + "," + targetCompID + ")"); /*write session reject*/
	        }

	        //====================================Step 8: Record incoming message (for crash resync)========================
	        //TODO
	        
	        console.log("Parsed FIX in: "+fix);


	        //====================================Step 9: Handle session logic========================

	        switch (msgType) {
	            case "0":
	                //handle heartbeat; break;
	                break;
	            case "1":
	                //handle testrequest; break;
	                var testReqID = fix["112"];
	                ctx.sendPrev({
	                    "35": "0",
	                    "112": testReqID
	                }); /*write heartbeat*/
	                break;
	            case "2":
	                var beginSeqNo = parseInt(fix["7"],10);
	                var endSeqNo = parseInt(fix["16"],10);
	                ctx.state.outgoingSeqNum = beginSeqNo;
	                var outmsgs = getOutMessages(targetCompID, beginSeqNo, endSeqNo);
	                for(var k in outmsgs){
	                    var resendmsg = msgs[k];
	                    resendmsg["43"] = "Y";
	                    resendmsg["122"] = resendmsg["SendingTime"];
	                    ctx.sendPrev(resendmsg);
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
	                break;
	            //Reset mode
	            //Reset mode is handled in step 6, when confirming incoming seqnums
	            //handle seqreset; break;
	            case "5":
	                //handle logout; break;
	                ctx.sendPrev({
	                    "35": "5"
	                }); /*write a logout ack right back*/
	                break;
	            case "A":
	                //handle logon; break;
	                //fixVersion = fix["8"];
	                //senderCompID = fix["56"];
	                //targetCompID = fix["49"];

	                ctx.state.fixVersion = fix["8"];
	                ctx.state.senderCompID = fix["56"];
	                ctx.state.targetCompID = fix["49"];

	                //create data store
	                //datastore = dirtyStore('./data/' + senderCompID + '-' + targetCompID + '-' + fixVersion + '.dat');
	                //datastore.set("incoming-"+incomingSeqNo,msg);

	                ctx.state.heartbeatDuration = parseInt(fix["108"], 10) * 1000;
	                ctx.state.loggedIn = true;
	                //heartbeatIntervalID = setInterval(heartbeatCallback, ctx.state.heartbeatDuration);
	                //heartbeatIntervalIDs.push(intervalID);
	                //this.emit("logon", targetCompID,stream);
	                //ctx.sendNext({eventType:"logon", data:ctx.state.targetCompID});
	                logger.info(fix["49"] + " logged on from " + stream.remoteAddress);
	                    
	                break;
	            default:
	        }
	        
	        //====================================Step 10: Forward to application========================
	        //TODO

	    }
	}

}

function getUTCTimeStamp(datetime){
    var timestamp = datetime || new Date();
    
    var year = timestamp.getUTCFullYear();
    var month = timestamp.getUTCMonth();
    var day = timestamp.getUTCDate();
    var hours = timestamp.getUTCHours();
    var minutes = timestamp.getUTCMinutes();
    var seconds = timestamp.getUTCSeconds();
    var millis = timestamp.getUTCMilliseconds();
    

    if(month < 10){
        month = "0" + month;
    }
    
    if(day < 10){
        day = "0" + day;
    }
    
    if(hours < 10){
        hours = "0" + hours;
    }
    
    if(minutes < 10){
        minutes = "0" + minutes;
    }
    
    if(seconds < 10){
        seconds = "0" + seconds;
    }
    
    if(millis < 10){
        millis = "00" + millis;
    } else if(millis < 100){
        millis = "0" + millis;    
    }
    
    
    var ts = [year , month , day , "-" , hours , ":" , minutes , ":" , seconds , "." , millis].join("");

    return ts;
}

