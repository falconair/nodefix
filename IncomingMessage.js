var Message = require("./Message");
var map = require("./map");
var SOH = String.fromCharCode(1);

function IncomingMessage(raw) {
    var items = raw.split(SOH);
    if (raw[raw.length - 1] === SOH) {
        items.splice(items.length - 1, 1);
    } else {
        console.log("[ERROR] Expected incoming message to end with 'Start Of Heading' char");
    }
    this.raw = raw;
    this.data = [];
    items.forEach(function (item) {
        var pair = item.split("=");
        this.data.push([map.getField(pair[0]), pair[1]]);
    }.bind(this));
}

IncomingMessage.prototype = new Message();

module.exports = IncomingMessage;