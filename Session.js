var events = require("events");
var fs = require("fs");
var _  = require("underscore");
var OutgoingMessage = require("./OutgoingMessage");

/**
 * Furnishes outgoing messages with header data
 * Ensures message sequence integrity.
 * Sends heartbeat messages
 * Responds to sequence reset, test request, resend messages and handles acceptor logout
 * Logs to file
 *
 * @constructor
 */
function Session(settings) {

    this.fixVersion = settings.fixVersion;
    this.senderCompID = settings.senderCompID;
    this.targetCompID = settings.targetCompID;
    this.targetSubID = settings.targetSubID;

    this.sendHeartbeats = true;
    this.expectHeartbeats = true;
    this.respondToLogon = true;

    this.isLoggedIn = false;
    this.heartbeatIntervalID = "";
    this.timeOfLastIncoming = this.timeOfLastOutgoing = new Date().getTime();
    this.testRequestID = 1;
    this.incomingSeqNum = 1;
    this.outgoingSeqNum = 1;
    this.isResendRequested = false;
    this.isLogoutRequested = false;

    this.file = null;
}

Session.prototype = new events.EventEmitter();

Session.prototype.outgoing = function (message) {
    this.sendMessage(message);
};

Session.prototype.incoming = function (message) {

    var messageType = message.getType();

    this.timeOfLastIncoming = new Date().getTime();

    if (this.isLoggedIn === false) {
        // Confirm first message is logon
        if (messageType === "Logon") {
            this.processIncomingLogon(message);
            this.startHeartbeat(message);
        } else {
            console.log("[ERROR] First message must be logon:", message.getFIX());
            this.emit("fatal");
            return;
        }
    }

    this.logMessage(this.timeOfLastIncoming, message);

    // Process seq-reset (no gap-fill)
    if (messageType === "Sequence Reset" && typeof message.get("GapFillFlag") === "undefined" || message.get("GapFillFlag") === "N") {
        var resetseqno = parseInt(message.get("NewSeqNo"), 10);
        if (resetseqno >= this.incomingSeqNum) {
            this.incomingSeqNum = resetseqno;
        } else {
            console.log("[ERROR] Seq-reset may not decrement sequence numbers:", message.getFIX());
            this.emit("fatal");
            return;
        }
    }

    if (!this.checkIncomingSequenceNumber(message)) {
        return false;
    }

    // Process sequence-reset with gap-fill
    if (messageType === "Sequence Reset" && message.get("GapFillFlag") === "Y") {
        var newSeqNo = parseInt(message.get("NewSeqNo"), 10);

        if (newSeqNo >= this.incomingSeqNum) {
            this.incomingSeqNum = newSeqNo;
        } else {
            console.log("[ERROR] Seq-reset may not decrement sequence numbers: " + message.getFIX());
            this.emit("fatal");
        }
        return;
    }

    // Check compids and version
    // TODO
    // Process test request
    if (messageType === "Test Request") {
        var testReqID = message.get("TestReqID");
        this.sendMessage(new OutgoingMessage("Heartbeat", [
            ["TestReqID", testReqID]
        ]));
        return;
    }

    // Process resend-request
    if (messageType === "Resend Request") {
        this.resendLastMessage();
        return;
    }

    // Process logout
    if (messageType === "Logout") {
        if (this.isLogoutRequested) {
            this.emit("fatal");
        } else {
            this.sendMessage(message);
        }
    }
};

Session.prototype.processIncomingLogon = function (message) {

    this.fixVersion = message.get("BeginString");

    // Swap incoming sender and target
    this.senderCompID = message.get("TargetCompID");
    this.targetCompID = message.get("SenderCompID");

    // Logon successful
    this.isLoggedIn = true;
    this.emit("logon");
};

Session.prototype.startHeartbeat = function (message) {

    var heartbeatInMsStr = _.isUndefined(message.get("HeartBtInt")) ? this.defaultHeartbeatSeconds : message.get("HeartBtInt");
    var heartbeatInMs = parseInt(heartbeatInMsStr, 10) * 1000;

    // Set heartbeat mechanism
    this.heartbeatIntervalID = setInterval(function () {
        var currentTime = new Date().getTime(),
            message;

        // Send heartbeats
        if (currentTime - this.timeOfLastOutgoing > heartbeatInMs && this.sendHeartbeats) {
            this.sendMessage(new OutgoingMessage("Heartbeat"));
        }

        // Ask counter party to wake up
        if (currentTime - this.timeOfLastIncoming > (heartbeatInMs * 1.5) && this.expectHeartbeats) {
            this.sendMessage(new OutgoingMessage("Test Request", [
                ["TestReqID", this.testRequestID++]
            ]));
        }

        // Counter party might be dead, kill connection
        if (currentTime - this.timeOfLastIncoming > heartbeatInMs * 2 && this.expectHeartbeats) {
            console.log("[ERROR] No heartbeat from counter party in milliseconds " + heartbeatInMs * 1.5);
            this.emit("fatal");
            return;
        }

    }, heartbeatInMs / 2);
};

Session.prototype.stopHeartbeat = function () {
    clearInterval(this.heartbeatIntervalID);
};

Session.prototype.checkIncomingSequenceNumber = function (message) {
    // Check sequence numbers
    var msgSeqNum = parseInt(message.get("MsgSeqNum"), 10);
    //expected sequence number
    if (msgSeqNum === this.incomingSeqNum) {
        this.incomingSeqNum++;
        this.isResendRequested = false;

    //less than expected
    } else if (msgSeqNum < this.incomingSeqNum) {

        //ignore posdup
        if (message.get("PossDupFlag") === "Y") {
            return false;

        //if not posdup, error
        } else {
            console.log("[ERROR] Incoming sequence number (" + msgSeqNum + ") lower than expected (" + this.incomingSeqNum + "):", message.getFIX());
            this.emit("fatal");
            return false;
        }

    // greater than expected
    } else {

        //is it resend request?
        if (message.getType() === "Resend Request") {
            this.resendLastMessage(message);
        }
        //did we already send a resend request?
        if (this.isResendRequested === false) {
            this.isResendRequested = true;
            //send resend-request
            this.sendMessage(new OutgoingMessage("Resend Request", [
                ["BeginSeqNo", this.incomingSeqNum],
                ["EndSeqNo", "0"]
            ]));
        }
    }
    return true;
};

Session.prototype.resendLastMessage = function () {

    var filename = "./traffic/" + this.senderCompID + "->" + this.targetCompID + ".log";

    //get list of msgs from archive and send them out, but gap fill admin msgs
    var reader = fs.createReadStream(filename, {
        flags: "r",
        encoding: "binary",
        mode: 0666,
        bufferSize: 4 * 1024
    });

    //TODO full lines may not be read
    reader.addListener("data", function (chunk) {
        console.log("chunk", chunk)
        var _fix = fixutil.converToMap(chunk);
        var _messageType = _fix[35];
        var _seqNo = _fix[34];
        if (_.contains(["A", "5", "2", "0", "1", "4"], _messageType)) {
            //send seq-reset with gap-fill Y
            this.sendMessage(new OutgoingMessage([
                ["MsgType", "4"],
                ["GapFillFlag", "Y"],
                ["NewSeqNo", _seqNo]
            ]));
        } else {
            //send msg w/ posdup Y
            this.sendMessage(_.extend(_fix, {
                "PossDupFlag": "Y" /////////////////////////////////// TODO
            }));
        }
    });
};

Session.prototype.sendMessage = function (message) {
    var now = new Date();
    this.timeOfLastOutgoing = now.getTime();
    this.prepareMessageForSend(message, now);
    this.outgoingSeqNum++;
    this.logMessage(now, message);
    this.emit("send", message);
};

Session.prototype.prepareMessageForSend = function (message, time) {
    message.setHeaderValue("BeginString", this.fixVersion);
    message.setHeaderValue("MsgSeqNum", this.outgoingSeqNum);
    message.setHeaderValue("SenderCompID", this.senderCompID);
    message.setHeaderValue("TargetCompID", this.targetCompID);
    message.setHeaderValue("TargetSubID", this.targetSubID);
    message.setTimeStamp(time);
    message.finalise();
};

Session.prototype.logMessage = function (time, message) {
    if (this.file === null) {
        var filename = "./traffic/" + this.senderCompID + "->" + this.targetCompID + ".log";
        this.file = fs.createWriteStream(filename, {
            flags: "a+"
        });
        this.file.on("error", function (error) {
            console.log(error);
        });
    }
    this.file.write(time.toString() + " " + message.getFIX() + "\n");
};

module.exports = Session;