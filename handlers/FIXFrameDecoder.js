var logger = require("../lib/logger").createLogger();

var SOHCHAR = require("../utils").SOHCHAR;
var ENDOFTAG8 = require("../utils").ENDOFTAG8;
var STARTOFTAG9VAL = require("../utils").STARTOFTAG9VAL;
var SIZEOFTAG10 = require("../utils").SIZEOFTAG10;
var logger_format = require("../utils").logger_format;

exports.makeFIXFrameDecoder = function(){ return new FIXFrameDecoder();}

logger.format = logger_format;

function FIXFrameDecoder(){
    this.description = "fix frame decoder: accepts raw text, creates messages";
    this.databuffer = "";
    var self = this;
    
    this.incoming = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.sendNext(event);
            return;
        }
        
        var stream = ctx.stream;
        
        self.databuffer += event.data;
        while (self.databuffer.length > 0) {
            //====Step 1: Extract complete FIX message====
            //If we don't have enough data to start extracting body length, wait for more data
            if (self.databuffer.length <= ENDOFTAG8) {
                return;
            }

            var _idxOfEndOfTag9Str = self.databuffer.substring(ENDOFTAG8).indexOf(SOHCHAR);
            var idxOfEndOfTag9 = parseInt(_idxOfEndOfTag9Str, 10) + ENDOFTAG8;

            if (isNaN(idxOfEndOfTag9)) {
                logger.error("[ERROR] Unable to find the location of the end of tag 9. Message probably misformed: " + self.databuffer.toString());
                stream.end();
                return;
            }


            //If we don't have enough data to stop extracting body length AND we have received a lot of data
            //then perhaps there is a problem with how the message is formatted and the session should be killed
            if (idxOfEndOfTag9 < 0 && self.databuffer.length > 100) {
                logger.error("[ERROR] Over 100 character received but body length still not extractable.  Message probably misformed: " + databuffer.toString());
                stream.end();
                return;
            }


            //If we don't have enough data to stop extracting body length, wait for more data
            if (idxOfEndOfTag9 < 0) {
                return;
            }

            var _bodyLengthStr = self.databuffer.substring(STARTOFTAG9VAL, idxOfEndOfTag9);
            var bodyLength = parseInt(_bodyLengthStr, 10);
            if (isNaN(bodyLength)) {
                logger.error("[ERROR] Unable to parse bodyLength field. Message probably misformed: bodyLength='" + _bodyLengthStr + "', msg=" + self.databuffer.toString());
                stream.end();
                return;
            }

            var msgLength = bodyLength + idxOfEndOfTag9 + SIZEOFTAG10 ;

            //If we don't have enough data for the whole message, wait for more data
            if (self.databuffer.length < msgLength) {
                return;
            }

            var msg = self.databuffer.substring(0, msgLength);
            if (msgLength == self.databuffer.length) {
                self.databuffer = "";
            }
            else {
                var remainingBuffer = self.databuffer.substring(msgLength);
                //logger.info("[DEBUG] debugstr:" + remainingBuffer);
                self.databuffer = remainingBuffer;
            }

            logger.info("FIX in: " + msg);

            ctx.sendNext({eventType:"data",data:msg});
        }
    }
}

