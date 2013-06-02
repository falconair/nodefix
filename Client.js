var util = require('util');
var fs = require('fs');
var net = require('net');
var events = require('events');
var _  = require('underscore');

var OutgoingMessage = require("./OutgoingMessage");
var IncomingMessage = require("./IncomingMessage");
var Buffer = require("./Buffer");
var Session = require("./Session");

/**
 * @constructor
 * @param {object} settings
 * @param {string} settings.host
 * @param {number} settings.port
 * @param {string} settings.fixVersion
 * @param {string} settings.senderCompID
 * @param {string} settings.targetCompID
 * @param {string} settings.targetSubID
 * @fires connect
 * @fires logon
 * @fires outgoing
 * @fires incoming
 * @fires error
 * @fires end
 */

function Client(settings) {
    this.settings = settings;
    this.connect();
}

Client.prototype = new events.EventEmitter();

/**
 * @public
 */
Client.prototype.connect = function () {
    this.stream = net.createConnection(this.settings.port, this.settings.host);
    this.buffer = new Buffer();
    this.session = new Session(this.settings);

    this.stream.on("connect", this._onConnected.bind(this));
    this.stream.on("data", this._onIncomingData.bind(this));
    this.stream.on("end", this._onDisconnected.bind(this));
    this.stream.on("error", this._onStreamError.bind(this));

    this.buffer.on("message", this._onIncomingMessage.bind(this));
    this.buffer.on("fatal", this._onFatal.bind(this));

    this.session.on("send", this._finalSend.bind(this));
    this.session.on("logon", this._onLogon.bind(this));
    this.session.on("fatal", this._onFatal.bind(this));
};

/**
 * @public
 * @param  {[type]} username
 * @param  {[type]} password
 */
Client.prototype.logon = function (username, password) {
    this.send("Logon", [
        ["EncryptMethod", "0"],
        ["HeartBtInt", "30"],
        ["ResetSeqNumFlag", "Y"]
    ]);
    this.send("UserRequest", [
        ["Username", username],
        ["Password", password],
        ["UserRequestID", "1"],
        ["UserRequestType", "1"]
    ]);
};

/**
 * @public
 * @param  {string} messageType
 * @param  {array}  data
 */
Client.prototype.send = function (messageType, data) {
    var message = new OutgoingMessage(messageType, data);
    this.session.outgoing(message);
};

/**
 * @public
 * @param  {string} reason
 */
Client.prototype.logoff = function (reason) {
    this.send("Logout", [
        ["Text", reason]
    ]);
};

Client.prototype._onConnected = function () {
    this.emit("connect");
};

Client.prototype._finalSend = function (message) {
    this.stream.write(message.getFIX());
    this.emit("outgoing", message);
};

Client.prototype._onIncomingData = function (raw) {
    this.buffer.incoming(raw);
};

Client.prototype._onIncomingMessage = function (data) {
    var message = new IncomingMessage(data);
    this.session.incoming(message);
    this.emit("incoming", message);
};

Client.prototype._onLogon = function () {
    this.emit("logon");
};

Client.prototype._onFatal = function () {
    this.logoff("Buffer or session failure");
    this.stream.end();
};

Client.prototype._onStreamError = function (error) {
    console.log("[ERROR] Could not connect:", error);
    this.emit("error", error);
};

Client.prototype._onDisconnected = function () {
    this.session.stopHeartbeat();
    this.emit("end");
};

module.exports = Client;