var events = require("events");
var utility = require("./utility");

var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;

function Buffer () {
    this.buffer = "";
}

Buffer.prototype = new events.EventEmitter();

Buffer.prototype.incoming = function (raw) {
    var error;

    this.buffer = this.buffer + raw;

    while (this.buffer.length > 0) {

        // ==== Step 1: Extract complete FIX message

        //If we don't have enough data to start extracting body length, wait for more data
        if (this.buffer.length <= ENDOFTAG8) {
            return;
        }

        var idxOfEndOfTag9 = parseInt(this.buffer.substring(ENDOFTAG8).indexOf(SOHCHAR), 10) + ENDOFTAG8;

        if (isNaN(idxOfEndOfTag9)) {
            console.log("[ERROR] Unable to find the location of the end of tag 9. Message probably malformed:", this.buffer.toString());
            this.emit("error");
            return;
        }

        // If we don't have enough data to stop extracting body length AND we have received a lot of data
        // then perhaps there is a problem with how the message is formatted and the session should be killed
        if (idxOfEndOfTag9 < 0 && this.buffer.length > 100) {
            console.log("[ERROR] Over 100 character received but body length still not extractable.  Message malformed:", this.buffer.toString());
            this.emit("fatal");
            return;
        }

        //If we don"t have enough data to stop extracting body length, wait for more data
        if (idxOfEndOfTag9 < 0) {
            return;
        }

        var _bodyLengthStr = this.buffer.substring(STARTOFTAG9VAL, idxOfEndOfTag9);
        var bodyLength = parseInt(_bodyLengthStr, 10);
        if (isNaN(bodyLength)) {
            console.log("[ERROR] Unable to parse bodyLength field. Message probably malformed: bodyLength =", bodyLength, ", msg =", this.buffer.toString());
            this.emit("fatal");
            return;
        }

        var msgLength = bodyLength + idxOfEndOfTag9 + SIZEOFTAG10;

        // If we don"t have enough data for the whole message, wait for more data
        if (this.buffer.length < msgLength) {
            return;
        }

        // Message received!
        var msg = this.buffer.substring(0, msgLength);
        if (msgLength === this.buffer.length) {
            this.buffer = "";
        } else {
            var remainingBuffer = this.buffer.substring(msgLength);
            this.buffer = remainingBuffer;
        }

        // ==== Step 2: Validate message
        var calculatedChecksum = utility.getCheckSum(msg.substr(0, msg.length - 7));
        var extractedChecksum = msg.substr(msg.length - 4, 3);

        if (calculatedChecksum !== extractedChecksum) {
            console.log("[WARNING] Discarding message because body length or checksum are wrong (expected:", calculatedChecksum, ", received:", extractedChecksum, ")", msg);
            return;
        }

        this.emit("message", msg);
    }
};

module.exports = Buffer;