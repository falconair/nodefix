var sys = require('sys');
var fs = require('fs');
var net = require('net');
var events = require('events');


//-----------------------------Expose server API-----------------------------
exports.createServer = function( func ){
    return new Server(func);
}

function Server(func){
     events.EventEmitter.call(this);
     
     this.session = null;
     var self = this;
     
     this.stream = net.createServer(function(stream){
        stream.on('connect', function(){ 
            self.session = new FIX(stream, true);
            self.emit('connect'); 
            self.session.on('data', function(data){ self.emit('data', data); });
            func(self.session);
        });
        stream.on('data', function(data){ self.session.onData(data); });
        
        
     });
     
     this.listen = function(port, host){ self.stream.listen(port, host); };
}
sys.inherits(Server, events.EventEmitter);

//-----------------------------Expose client API-----------------------------
exports.createConnection = function(fixVersion, senderCompID, targetCompID, port, host){
    return new Client(fixVersion, senderCompID, targetCompID, port, host);
}

function Client(fixVersion, senderCompID, targetCompID, port, host){
    this.fixVersion = fixVersion;
    this.senderCompID = senderCompID;
    this.targetCompID = targetCompID;
    this.port = port;
    this.host = host;
    
    this.session = null;
    var self = this;
    
    events.EventEmitter.call(this);
    
    var stream = net.createConnection(port,host);
    stream.on('connect', function(){
        self.session = new FIX(stream, false);
        self.session.on('data', function(data){ self.emit('data',data); });
        self.session.write({"8":fixVersion, 
            "56":targetCompID, 
            "49":senderCompID, 
            "35":"A", 
            "90":"0", 
            "108":"30"});
        self.emit('connect'); 
    });
    stream.on('data', function(data){ self.session.onData(data); });
    
    this.write = function(data){ self.session.write(data); };
}
sys.inherits(Client, events.EventEmitter);

//-----------------------------Sesson Logic------------------------------

//static vars
var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;

var buffer = "";

function FIX(stream, isAcceptor){
    console.log("isAcceptor:"+isAcceptor);
    
    events.EventEmitter.call(this);

    this.fixVersion = "";
    this.senderCompID = "";
    this.targetCompID = "";
    
    this.outgoingSeqNum = 1;
    this.incomingSeqNum = 1;
    
    this.heartbeatDuration = 30;
    
    this.isLoggedIn = false;
    this.isResendRequested = false;
    
    this.timeOfLastOutgoing;
    this.timeOfLastIncoming;
    
    this.trafficFile = null;
    
    
    this.buffer = "";
    self = this;
    
    this.write = function(msg){
        
        if(self.fixVersion === "") self.fixVersion = msg["8"];
        if(self.senderCompID === "") self.senderCompID = msg["49"];
        if(self.targetCompID === "") self.targetCompID = msg["56"];
        
        if(!isAcceptor){
            var fileName = './traffic/' + self.fixVersion + '-' + self.senderCompID + '-' + self.targetCompID + '.log';
            self.trafficFile = fs.openSync(fileName,'a+');
            //fs.write(self.trafficFile, msg+'\n');
        }

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
        headermsgarr.push("56=" , (self.senderCompID) , SOHCHAR);
        headermsgarr.push("49=" , (self.targetCompID) , SOHCHAR);
        headermsgarr.push("34=" , (self.outgoingSeqNum++) , SOHCHAR);
        

        for (var tag in msg) {
            if(msg.hasOwnProperty(tag)) bodymsgarr.push( tag , "=" , msg[tag] , SOHCHAR);
        }
        
        var headermsg = headermsgarr.join("");
        var trailermsg = trailermsgarr.join("");
        var bodymsg = bodymsgarr.join("");
        
        var outmsgarr = [];
        outmsgarr.push( "8=" , self.fixVersion , SOHCHAR);
        outmsgarr.push( "9=" , (headermsg.length + bodymsg.length + trailermsg.length) , SOHCHAR);
        outmsgarr.push( headermsg);
        outmsgarr.push( bodymsg);
        outmsgarr.push( trailermsg);
        
        var outmsg = outmsgarr.join("");

        outmsg += "10=" + checksum(outmsg) + SOHCHAR;
        
        sys.log("FIX out: " + outmsg);
        fs.write(self.trafficFile, 'out:' + outmsg+'\n');
        self.timeOfLastOutgoing = timestamp.getTime();
        stream.write(outmsg);
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
                sys.log("[ERROR] Unable to find the location of the end of tag 9. Message probably misformed: " 
                    + buffer.toString());
                stream.end();
                return;
            }


            //If we don't have enough data to stop extracting body length AND we have received a lot of data
            //then perhaps there is a problem with how the message is formatted and the session should be killed
            if (idxOfEndOfTag9 < 0 && buffer.length > 100) {
                sys.log("[ERROR] Over 100 character received but body length still not extractable.  Message misformed: " 
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
                sys.log("[ERROR] Unable to parse bodyLength field. Message probably misformed: bodyLength='" 
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

            sys.log("FIX in: " + msg);

            //====================================Step 2: Validate message====================================

            var calculatedChecksum = checksum(msg.substr(0, msg.length - 7));
            var extractedChecksum = msg.substr(msg.length - 4, 3);

            if (calculatedChecksum !== extractedChecksum) {
                sys.log("[WARNING] Discarding message because body length or checksum are wrong (expected checksum: " 
                    + calculatedChecksum + ", received checksum: " + extractedChecksum + "): [" + msg + "]");
                return;
            }

            //====================================Step 3: Convert to map====================================

            var fix = convertToMap(msg);
            self.timeOfLastIncoming = new Date().getTime();

            //============================Step 4: Confirm all required fields are available====================================
            //TODO do this differently

            //============================Step 5: Confirm first message is logon and it has a heartbeat========================

            var msgType = fix["35"];
            
            if(!self.isLoggedIn && msgType != "A"){
                sys.log("[ERROR] Logon message expected, received message of type " + msgType + ", [" + msg + "]");
                stream.end();
                return;
            }

            if (msgType == "A" && fix["108"] === undefined) {
                sys.log("[ERROR] Logon does not have tag 108 (heartbeat) ");
                stream.end();
                return;
            }
            

            //====================================Step 6: Confirm incoming sequence numbers========================
            var _seqNum = parseInt(fix["34"], 10);
            if(fix["35"]==="4" /*seq reset*/ && (fix["123"] === undefined || fix["123"] === "N")){
                sys.log("Requence Reset request received: " + msg);
                var resetseqno = parseInt(fix["36"],10);
                if(resetseqno <= self.incomingSeqnum){
                //TODO: Reject, sequence number may only be incremented
                }
                else{
                    self.incomingSeqNum = resetseqno;
                }
            }
            if (self.isLoggedIn && _seqNum == self.incomingSeqNum) {
                self.incomingSeqNum++;
                self.resendRequested = false;
            }
            else if (self.isLoggedIn && _seqNum < self.incomingSeqNum) {
                var posdup = fix["43"];
                if(posdup !== undefined && posdup === "Y"){
                    sys.log("This posdup message's seqno has already been processed. Ignoring: "+msg);
                }
                sys.log("[ERROR] Incoming sequence number lower than expected. No way to recover:"+msg);
                stream.end();
                return;
            }
            else if (self.isLoggedIn && _seqNum > self.incomingSeqNum) {
                //Missing messages, write resend request and don't process any more messages
                //until the rewrite request is processed
                //set flag saying "waiting for rewrite"
                if(self.resendRequested !== true){
                    self.resendRequested = true;
                    self.write({
                        "35":2,
                        "7":self.incomingSeqNum,
                        "8":0
                    });
                }
            }

            //====================================Step 7: Confirm compids and fix version are correct========================

            var incomingFixVersion = fix["8"];
            var incomingsenderCompID = fix["56"];
            var incomingTargetCompID = fix["49"];

            if (self.isLoggedIn && 
                (self.fixVersion != incomingFixVersion || 
                    self.senderCompID != incomingsenderCompID || 
                    self.targetCompID != incomingTargetCompID)){
                    
                    sys.log("[WARNING] Incoming fix version (" + 
                        incomingFixVersion + 
                        "), sender compid (" + 
                        incomingsenderCompID + 
                        ") or target compid (" + 
                        incomingTargetCompID + 
                        ") did not match expected values (" + 
                        self.fixVersion + "," + self.senderCompID + "," + self.targetCompID + ")"); /*write session reject*/
            }
            

            //====================================Step 8: Record incoming message (for crash resync)========================
            if(fix["35"] !== "A"){//if logon, we'll write this msg in the logon handling section
                fs.write(self.trafficFile, 'in:' + msg+'\n');
            }


            //====================================Step 9: Handle session logic========================

            switch (msgType) {
                case "0":
                    //handle heartbeat; break;
                    break;
                case "1":
                    //handle testrequest; break;
                    var testReqID = fix["112"];
                    self.write({
                        "35": "0",
                        "112": testReqID
                    }); /*write heartbeat*/
                    break;
                case "2":
                    var beginSeqNo = parseInt(fix["7"],10);
                    var endSeqNo = parseInt(fix["16"],10);
                    self.outgoingSeqNum = beginSeqNo;
                    /*var outmsgs = getOutMessages(self.targetCompID, beginSeqNo, endSeqNo);
                    for(var k in outmsgs){
                        var resendmsg = msgs[k];
                        resendmsg["43"] = "Y";
                        resendmsg["122"] = resendmsg["SendingTime"];
                        self.write(resendmsg);
                    }*/
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
                    self.write({
                        "35": "5"
                    }); /*write a logout ack right back*/
                    break;
                case "A":
                    //handle logon; break;
                    //fixVersion = fix["8"];
                    //senderCompID = fix["56"];
                    //targetCompID = fix["49"];

                    if(self.fixVersion === "") self.fixVersion = fix["8"];
                    if(self.senderCompID === "") self.senderCompID = fix["49"];
                    if(self.targetCompID === "") self.targetCompID = fix["56"];

                    //create data store
                    //datastore = dirtyStore('./data/' + senderCompID + '-' + targetCompID + '-' + fixVersion + '.dat');
                    //datastore.set("incoming-"+incomingSeqNo,msg);

                    self.heartbeatDuration = parseInt(fix["108"], 10) * 1000;
                    self.isLoggedIn = true;
                    //heartbeatIntervalID = setInterval(heartbeatCallback, self.heartbeatDuration);
                    //heartbeatIntervalIDs.push(intervalID);
                    //this.emit("logon", targetCompID,stream);
                    //ctx.sendNext({eventType:"logon", data:self.targetCompID});
                    
                    console.log("isAcceptor:"+isAcceptor);
                    if(isAcceptor){
                        var fileName = './traffic/' + self.fixVersion + '-' + self.senderCompID + '-' + self.targetCompID + '.log';
                        self.trafficFile = fs.openSync(fileName,'a+');
                        fs.write(self.trafficFile, 'in:' + msg+'\n');
                    
                        self.write(fix);
                    }
                    sys.log(fix["49"] + " logged on from " + stream.remoteAddress);
                    
                    self.emit('logon', self.targetCompID);
                        
                    break;
                default:
            }
            
            //====================================Step 10: Forward to application========================
            self.emit('data', fix);

        }
    }

}
sys.inherits(FIX, events.EventEmitter);

function convertToMap(msg){
    var fix = {};
    var keyvals = msg.split(SOHCHAR);
    for (var kv in Object.keys(keyvals)) {
        var kvpair = keyvals[kv].split("=");
        fix[kvpair[0]] = kvpair[1];
    }
    return fix;

}

function checksum(str){
    var chksm = 0;
    for(var i=0; i<str.length; i++){
        chksm += str.charCodeAt(i);
    }
    
    chksm = chksm % 256;
    
    var checksumstr = "";
    if (chksm < 10) {
        checksumstr = "00" + (chksm+'');
    }
    else if (chksm >= 10 && chksm < 100) {
        checksumstr = "0" + (chksm+'');
    }
    else {
        checksumstr = "" + (chksm+'');
    }
    
    return checksumstr;
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

