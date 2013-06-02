var Message = require("./Message");
var map = require("./map");
var utility = require("./utility");

var SOH = String.fromCharCode(1);
var preHeaderFields = ["BeginString", "BodyLength"];
var headerFields = ["MsgType", "MsgSeqNum", "SenderCompID", "SendingTime", "TargetCompID", "TargetSubID"];

function OutgoingMessage(type, data) {
    this.preHeader = [];
    this.header = [];
    this.type = type;
    this.setHeaderValue("MsgType", map.getKey("MsgType", type));
    this.body = data || [];
    this.trailer = [];
}

OutgoingMessage.prototype = new Message();

OutgoingMessage.prototype.setHeaderValue = function (field, value) {
    var index = headerFields.indexOf(field);
    if (index === -1) {
        this.preHeader[preHeaderFields.indexOf(field)] = [field, value];
    } else {
        this.header[index] = [field, value];
    }
};

// Call once header and body fields are set and final
OutgoingMessage.prototype.finalise = function (field, value) {

    this.headerFIX = this.convertToFIX(this.header);
    this.bodyFIX = this.convertToFIX(this.body);

    this.setHeaderValue("BodyLength", this.headerFIX.length + this.bodyFIX.length);

    this.preHeaderFIX = this.convertToFIX(this.preHeader);

    this.trailer = [["CheckSum", utility.getCheckSum(this.preHeaderFIX + this.headerFIX + this.bodyFIX)]];
    this.trailerFIX = this.convertToFIX(this.trailer);

    this.data = this.preHeader.concat(this.header, this.body, this.trailer);
    this.raw = this.preHeaderFIX + this.headerFIX + this.bodyFIX + this.trailerFIX;
};

OutgoingMessage.prototype.setTimeStamp = function (time) {
    this.setHeaderValue("SendingTime", utility.getUTCTimeStamp(time));
};

OutgoingMessage.prototype.convertToFIX = function (data) {
    var fix = [];
    data.forEach(function (item) {
        var fieldKey = map.keys[item[0]];
        if (!fieldKey) {
            console.log("[Error] Incorrect FIX field specified:", item[0]);
            return;
        }
        fix.push(map.keys[item[0]], "=", item[1], SOH);
    });
    return fix.join("");
};

module.exports = OutgoingMessage;


