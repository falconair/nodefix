var sys = require('sys');
var fs = require('fs');
var net = require('net');
var events = require('events');
var path = require('path');


//-----------------------------Expose server API-----------------------------
exports.createServer = function(func ) {
    var server = new Server(func);
    return server;
};

function Server(func) {
     events.EventEmitter.call(this);

     this.sessions = {};

     var self = this;

     this.stream = net.createServer(function(stream) {

        this.senderCompID = null;
        this.targetCompID = null;

        var session = new FIX(stream, true);
        stream.on('connect', function() {
            self.emit('connect');
            session.on('data', function(data) { self.emit('data', data); });
            session.on('incomingdata', function(data) { self.emit('incomingdata', data); });
            session.on('outgoingdata', function(data) { self.emit('outgoingdata', data); });
            session.on('error', function(exception) { self.emit('error', exception); });

            session.on('logon', function(sender,target) {
                self.sessions[sender + '-'+ target] = session;
                self.senderCompID = sender;
                self.targetCompID = target;
                self.emit('logon', sender, target);
            });
            session.on('logoff', function(sender,target) {
                delete self.sessions[sender + '-'+ target];
                self.emit('logoff', sender, target);
            });
            func(session);
        });
        stream.on('end', function() { self.emit('end', this.senderCompID, this.targetCompID); });//TODO Client doesn't see this!
        stream.on('data', function(data) { session.onData(data); });


     });

     this.listen = function(port, host) { self.stream.listen(port, host); };
     this.write = function(targetCompID, data) { self.sessions[id].write(data); };
}
sys.inherits(Server, events.EventEmitter);

//-----------------------------Expose client API-----------------------------
exports.createConnection = function(fixVersion, senderCompID, targetCompID, port, host) {
    return new Client({'8': fixVersion, '56': targetCompID, '49': senderCompID, '35': 'A', '90': '0', '108': '30'}, port, host);
};

exports.createConnectionWithLogonMsg = function(logonmsg, port, host) {
    return new Client(logonmsg, port, host);
};

function Client(logonmsg, port, host) {

    this.session = null;
    var self = this;

    events.EventEmitter.call(this);

    var stream = net.createConnection(port, host);
    stream.on('connect', function() {
        self.emit('connect');
        self.session = new FIX(stream, false);
        self.session.on('data', function(data) { self.emit('data', data); });
        self.session.on('incomingmsg', function(data) { self.emit('incomingmsg', data); });
        self.session.on('incomingmsg', function(data) { self.emit('incomingmsg', data); });
        self.session.on('logon', function(sender,target) { self.emit('logon', sender, target); });
        self.session.on('logoff', function(sender,target) { self.emit('logoff', sender, target); });
        self.session.write(logonmsg);
    });
    stream.on('data', function(data) { self.session.onData(data); });
    stream.on('end', function() { self.emit('end'); });
    stream.on('error', function(exception) { self.emit('error', exception); });

    this.write = function(data) { self.session.write(data); };
}
sys.inherits(Client, events.EventEmitter);

//-----------------------------Sesson Logic------------------------------

//static vars
var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;

var buffer = '';

function FIX(stream, isAcceptor) {

    events.EventEmitter.call(this);

    this.fixVersion = '';
    this.senderCompID = '';
    this.targetCompID = '';

    this.outgoingSeqNum = 1;
    this.incomingSeqNum = 1;

    this.heartbeatDuration = 30;
    this.heartbeatIntervalID;
    this.testRequestID = 1;

    this.isLoggedIn = false;
    this.isResendRequested = false;

    this.timeOfLastOutgoing;
    this.timeOfLastIncoming;

    this.trafficFile = null;


    this.buffer = '';
    self = this;

    //+++++++++++++++++++++++++++++++++++++++write++++++++++++++++++++++++++++++++++++
    this.write = function(msgraw) {

        //defensive copy
        var msg = {};
        for (var tag in msgraw) {
            if (msgraw.hasOwnProperty(tag)) msg[tag] = msgraw[tag];
        }


        if (!isAcceptor && (self.fixVersion === '' || self.senderCompID === '' || self.targetCompID === '')) {
            self.fixVersion = msg['8'];
            self.senderCompID = msg['49'];
            self.targetCompID = msg['56'];
            sys.log("Setting compd ids in 'write' (" + self.fixVersion + ','+ self.senderCompID + ','+ self.targetCompID + ')');
        }

        if (!isAcceptor) {
            var fileName = './traffic/' + self.fixVersion + '-' + self.senderCompID + '-' + self.targetCompID + '.log';

            if (path.existsSync(fileName)) {
                sys.log('Reading existing data file '+ fileName);
                var rawFileContents = fs.readFileSync(fileName, 'ASCII');
                var fileContents = rawFileContents.split('\n');

                for (var i = 0; i < fileContents.length; i++) {
                    var map = convertToMap(fileContents[i]);
                    if (map['49'] === self.senderCompID) { self.outgoingSeqNum = parseInt(map['34'], 10) + 1; }
                    if (map['56'] === self.senderCompID) { self.incomingSeqNum = parseInt(map['34'], 10) + 1; }
                }
            }

            self.trafficFile = fs.openSync(fileName, 'a+');

        }

        /*
        delete msg["8"]; //fixversion
        delete msg["9"]; //bodylength
        delete msg["10"]; //checksum
        delete msg["52"]; //timestamp
        delete msg["49"]; //sendercompid
        delete msg["56"]; //targetcompid
        delete msg["34"]; //seqnum
        */
        delete msg['9']; //bodylength
        delete msg['10']; //checksum


        var timestamp = new Date();
        var headermsgarr = [];
        var bodymsgarr = [];
        var trailermsgarr = [];

        msg['8'] = self.fixVersion; //fixversion
        //msg["9"]; //bodylength
        //msg["10"]; //checksum
        msg['52'] = getUTCTimeStamp(timestamp); //timestamp
        msg['49'] = self.senderCompID; //sendercompid
        msg['56'] = self.targetCompID; //targetcompid
        msg['34'] = self.outgoingSeqNum; //seqnum


        headermsgarr.push('52=' + msg['52'] , SOHCHAR);
        headermsgarr.push('49=' + msg['49'] , SOHCHAR);
        headermsgarr.push('56=' + msg['56'] , SOHCHAR);
        headermsgarr.push('34=' + msg['34'] , SOHCHAR);


        for (var tag in msg) {
            if (msg.hasOwnProperty(tag)
                && tag !== 8
                && tag !== 9
                && tag !== 10
                && tag !== 52
                && tag !== 49
                && tag !== 56
                && tag !== 34
                ) bodymsgarr.push(tag, '=' , msg[tag] , SOHCHAR);
        }

        var headermsg = headermsgarr.join('');
        var trailermsg = trailermsgarr.join('');
        var bodymsg = bodymsgarr.join('');

        var outmsgarr = [];
        outmsgarr.push('8=' , msg['8'] , SOHCHAR);
        outmsgarr.push('9=' , (headermsg.length + bodymsg.length + trailermsg.length) , SOHCHAR);
        outmsgarr.push(headermsg);
        outmsgarr.push(bodymsg);
        outmsgarr.push(trailermsg);

        var outmsg = outmsgarr.join('');

        outmsg += '10=' + checksum(outmsg) + SOHCHAR;

        sys.log('FIX out: ' + outmsg);
        fs.write(self.trafficFile, outmsg + '\n');
        self.timeOfLastOutgoing = timestamp.getTime();
        self.emit('outgoingmsg', msg);
        stream.write(outmsg);
        self.outgoingSeqNum++;
    }

    //+++++++++++++++++++++++++++++++++++++++onData++++++++++++++++++++++++++++++++++++
    this.onData = function(data) {

        buffer += data;

        while (buffer.length > 0) {
            //====================================Step 1: Extract complete FIX message====================================

            //If we don't have enough data to start extracting body length, wait for more data
            if (buffer.length <= ENDOFTAG8) {
                return;
            }

            var _idxOfEndOfTag9Str = buffer.substring(ENDOFTAG8).indexOf(SOHCHAR);
            var idxOfEndOfTag9 = parseInt(_idxOfEndOfTag9Str, 10) + ENDOFTAG8;

            if (isNaN(idxOfEndOfTag9)) {
                sys.log('[ERROR] Unable to find the location of the end of tag 9. Message probably misformed: '
                    + buffer.toString());
                stream.end();
                return;
            }


            //If we don't have enough data to stop extracting body length AND we have received a lot of data
            //then perhaps there is a problem with how the message is formatted and the session should be killed
            if (idxOfEndOfTag9 < 0 && buffer.length > 100) {
                sys.log('[ERROR] Over 100 character received but body length still not extractable.  Message misformed: '
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

            var msgLength = bodyLength + idxOfEndOfTag9 + SIZEOFTAG10;

            //If we don't have enough data for the whole message, wait for more data
            if (buffer.length < msgLength) {
                return;
            }

            //Message received!
            var msg = buffer.substring(0, msgLength);
            if (msgLength == buffer.length) {
                buffer = '';
            }
            else {
                var remainingBuffer = buffer.substring(msgLength);
                buffer = remainingBuffer;
            }

            sys.log('FIX in: ' + msg);

            //====================================Step 2: Validate message====================================

            var calculatedChecksum = checksum(msg.substr(0, msg.length - 7));
            var extractedChecksum = msg.substr(msg.length - 4, 3);

            if (calculatedChecksum !== extractedChecksum) {
                sys.log('[WARNING] Discarding message because body length or checksum are wrong (expected checksum: '
                    + calculatedChecksum + ', received checksum: ' + extractedChecksum + '): [' + msg + ']');
                return;
            }

            //====================================Step 3: Convert to map====================================

            var fix = convertToMap(msg);
            self.emit('incomingmsg', fix);
            self.timeOfLastIncoming = new Date().getTime();

            //============================Step 4: Confirm all required fields are available====================================
            //TODO do this differently

            //============================Step 5: Confirm first message is logon and it has a heartbeat========================

            var msgType = fix['35'];

            if (!self.isLoggedIn && msgType != 'A') {
                sys.log('[ERROR] Logon message expected, received message of type ' + msgType + ', [' + msg + ']');
                stream.end();
                return;
            }

            if (msgType == 'A' && fix['108'] === undefined) {
                sys.log('[ERROR] Logon does not have tag 108 (heartbeat) ');
                stream.end();
                return;
            }

            //============================Step 6: Process Logon========================


            if (isAcceptor) {
                self.fixVersion = fix['8'];
                self.senderCompID = fix['56'];
                self.targetCompID = fix['49'];

                sys.log("Setting compd ids in 'onData' (" + self.fixVersion + ','+ self.senderCompID + ','+ self.targetCompID + ')');

                //create data store
                var fileName = './traffic/' + self.fixVersion + '-' + self.senderCompID + '-' + self.targetCompID + '.log';

                if (path.existsSync(fileName)) {
                    sys.log('Reading existing data file '+ fileName);
                    var rawFileContents = fs.readFileSync(fileName, 'ASCII');
                    var fileContents = rawFileContents.split('\n');

                    for (var i = 0; i < fileContents.length; i++) {
                        var map = convertToMap(fileContents[i]);
                        if (map['49'] === self.senderCompID) { self.outgoingSeqNum = parseInt(map['34'], 10) + 1; }
                        if (map['56'] === self.senderCompID) { self.incomingSeqNum = parseInt(map['34'], 10) + 1; }
                    }
                }


                self.trafficFile = fs.openSync(fileName, 'a+');

            }


            //====================================Step 7: Confirm incoming sequence numbers========================
            var _seqNum = parseInt(fix['34'], 10);

            if (_seqNum === self.incomingSeqNum) {
                self.incomingSeqNum++;
                self.resendRequested = false;
            }
            else if (_seqNum < self.incomingSeqNum) {
                var posdup = fix['43'];
                if (posdup !== undefined && posdup === 'Y') {
                    sys.log("This posdup message's seqno has already been processed. Ignoring: " + msg);
                }
                sys.log('[ERROR] Incoming sequence ('+ _seqNum + ') number lower than expected ('+ self.incomingSeqNum + '). No way to recover:'+ msg);
                stream.end();
                return;
            }
            else if (_seqNum > self.incomingSeqNum) {
                //Missing messages, write resend request and don't process any more messages
                //until the rewrite request is processed
                //set flag saying "waiting for rewrite"
                if (self.resendRequested !== true) {
                    self.resendRequested = true;
                    sys.log('[WARN] Incoming seqnum ('+ _seqNum + ') higher than expected ('+ self.incomingSeqNum + '), sending resend request');
                    self.write({
                        '35': 2,
                        '7': self.incomingSeqNum,
                        '8': 0
                    });
                }
            }

            //====================================Step 8: Confirm compids and fix version are correct========================

            var incomingFixVersion = fix['8'];
            var incomingsenderCompID = fix['49'];
            var incomingTargetCompID = fix['56'];


            if (self.isLoggedIn &&
                (self.fixVersion != incomingFixVersion ||
                    self.senderCompID != incomingTargetCompID ||
                    self.targetCompID != incomingsenderCompID)) {

                    sys.log('[WARNING] Incoming fix version (' +
                        incomingFixVersion +
                        '), sender compid (' +
                        incomingsenderCompID +
                        ') or target compid (' +
                        incomingTargetCompID +
                        ') did not match expected values (' +
                        self.fixVersion + ',' + self.senderCompID + ',' + self.targetCompID + ')'); /*write session reject*/
            }


            //====================================Step 9: Ack Logon========================

            if (!self.resendRequested) {
                if (isAcceptor) {
                    //ack logon
                    self.write(fix);
                }

                self.heartbeatDuration = parseInt(fix['108'], 10) * 1000;
                self.isLoggedIn = true;
                self.heartbeatIntervalID = setInterval(self.heartbeatCallback, self.heartbeatDuration);
                //heartbeatIntervalIDs.push(intervalID);

                sys.log(self.targetCompID + ' logged on from ' + stream.remoteAddress +
                    ' with seqnums ' + self.incomingSeqNum + ',' + self.outgoingSeqNum);

                self.emit('logon', self.senderCompID, self.targetCompID);
            }

            //====================================Step 10: Record incoming message (for crash resync)========================
            fs.write(self.trafficFile, msg + '\n');


            //====================================Step 11: Handle session logic========================

            switch (msgType) {
                case '0':
                    //handle heartbeat; break;
                    break;
                case '1':
                    //handle testrequest; break;
                    var testReqID = fix['112'];
                    self.write({
                        '35': '0',
                        '112': testReqID
                    }); /*write heartbeat*/
                    break;
                case '2':
                    var beginSeqNo = parseInt(fix['7'], 10);
                    var endSeqNo = parseInt(fix['16'], 10);
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
                case '3':
                    //handle sessionreject; break;
                    break;
                case '4':
                    if (fix['123'] === undefined || fix['123'] === 'N') {
                        sys.log('Requence Reset request received: ' + msg);
                        var resetseqno = parseInt(fix['36'], 10);
                        if (resetseqno <= self.incomingSeqnum) {
                            //TODO: Reject, sequence number may only be incremented
                        }
                        else {
                            self.incomingSeqNum = resetseqno;
                        }
                    }
                    //Gap fill mode
                    if (fix['123'] === 'Y') {
                        var newSeqNo = parseInt(fix['36'], 10);

                        if (newSeqNo <= incomingSeqNo) {
                        //TODO: Reject, sequence number may only be incremented
                        }
                        else {
                            incomingSeqNo = newSeqNo;
                        }
                    }
                    break;
                //Reset mode
                //handle seqreset; break;
                case '5':
                    //handle logout; break;
                    self.write({
                        '35': '5'
                    });
                    clearInterval(self.heartbeatIntervalID);
                    self.emit('logoff', self.senderCompID, self.targetCompID);
                    if(!isAcceptor){
                        stream.end();
                    }

                    /*write a logout ack right back*/
                    break;
                case 'A':
                    //handle logon; break;
                    //TODO Logon should be handleed before seqnum check!


                    break;
                default:
            }

            //====================================Step 12: Forward to application========================
            self.emit('data', fix);

        }
    }
    
    this.heartbeatCallback = function(){
        var currentTime = new Date().getTime();
        
        if((currentTime - self.timeOfLastOutgoing) >  self.heartbeatDuration){
            self.write({'35':'0'});
        }
        
        if((currentTime - self.timeOfLastIncoming) > self.heartbeatDuration * 1.5){
            self.write({'35':'1', '112':self.testRequestID++});//112 = testrequestid
        }
    }

}
sys.inherits(FIX, events.EventEmitter);

function convertToMap(msg) {
    var fix = {};
    var keyvals = msg.split(SOHCHAR);
    for (var kv in Object.keys(keyvals)) {
        var kvpair = keyvals[kv].split('=');
        fix[kvpair[0]] = kvpair[1];
    }
    return fix;

}

function checksum(str) {
    var chksm = 0;
    for (var i = 0; i < str.length; i++) {
        chksm += str.charCodeAt(i);
    }

    chksm = chksm % 256;

    var checksumstr = '';
    if (chksm < 10) {
        checksumstr = '00' + (chksm + '');
    }
    else if (chksm >= 10 && chksm < 100) {
        checksumstr = '0' + (chksm + '');
    }
    else {
        checksumstr = '' + (chksm + '');
    }

    return checksumstr;
}

function getUTCTimeStamp(datetime) {
    var timestamp = datetime || new Date();

    var year = timestamp.getUTCFullYear();
    var month = timestamp.getUTCMonth();
    var day = timestamp.getUTCDate();
    var hours = timestamp.getUTCHours();
    var minutes = timestamp.getUTCMinutes();
    var seconds = timestamp.getUTCSeconds();
    var millis = timestamp.getUTCMilliseconds();


    if (month < 10) {
        month = '0' + month;
    }

    if (day < 10) {
        day = '0' + day;
    }

    if (hours < 10) {
        hours = '0' + hours;
    }

    if (minutes < 10) {
        minutes = '0' + minutes;
    }

    if (seconds < 10) {
        seconds = '0' + seconds;
    }

    if (millis < 10) {
        millis = '00' + millis;
    } else if (millis < 100) {
        millis = '0' + millis;
    }


    var ts = [year, month, day, '-' , hours, ':' , minutes, ':' , seconds, '.' , millis].join('');

    return ts;
}

