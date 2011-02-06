exports.newFixFrameDecoder = function() {
    return new fixFrameDecoder();
};

//static vars
var SOHCHAR = String.fromCharCode(1);
var ENDOFTAG8 = 10;
var STARTOFTAG9VAL = ENDOFTAG8 + 2;
var SIZEOFTAG10 = 8;

function fixFrameDecoder(){
    this.buffer = '';
    var self = this;
    this.incoming = function(ctx, event){
        if(event.type !== 'data'){
            ctx.sendNext(event);
            return;
        }
        self.buffer = self.buffer + event.data;
        while (self.buffer.length > 0) {
            //====================================Step 1: Extract complete FIX message====================================

            //If we don't have enough data to start extracting body length, wait for more data
            if (self.buffer.length <= ENDOFTAG8) {
                return;
            }

            var _idxOfEndOfTag9Str = self.buffer.substring(ENDOFTAG8).indexOf(SOHCHAR);
            var idxOfEndOfTag9 = parseInt(_idxOfEndOfTag9Str, 10) + ENDOFTAG8;

            if (isNaN(idxOfEndOfTag9)) {
                sys.log('[ERROR] Unable to find the location of the end of tag 9. Message probably misformed: '
                    + self.buffer.toString());
                stream.end();
                return;
            }


            //If we don't have enough data to stop extracting body length AND we have received a lot of data
            //then perhaps there is a problem with how the message is formatted and the session should be killed
            if (idxOfEndOfTag9 < 0 && self.buffer.length > 100) {
                sys.log('[ERROR] Over 100 character received but body length still not extractable.  Message misformed: '
                    + databuffer.toString());
                stream.end();
                return;
            }


            //If we don't have enough data to stop extracting body length, wait for more data
            if (idxOfEndOfTag9 < 0) {
                return;
            }

            var _bodyLengthStr = self.buffer.substring(STARTOFTAG9VAL, idxOfEndOfTag9);
            var bodyLength = parseInt(_bodyLengthStr, 10);
            if (isNaN(bodyLength)) {
                sys.log("[ERROR] Unable to parse bodyLength field. Message probably misformed: bodyLength='"
                    + _bodyLengthStr + "', msg=" + self.buffer.toString());
                stream.end();
                return;
            }

            var msgLength = bodyLength + idxOfEndOfTag9 + SIZEOFTAG10;

            //If we don't have enough data for the whole message, wait for more data
            if (self.buffer.length < msgLength) {
                return;
            }

            //Message received!
            var msg = self.buffer.substring(0, msgLength);
            if (msgLength == self.buffer.length) {
                self.buffer = '';
            }
            else {
                var remainingBuffer = self.buffer.substring(msgLength);
                self.buffer = remainingBuffer;
            }

            ctx.sendNext({data:msg, type:'data'});
        }
    }
    
    this.outgoing = function(ctx, event){
        if(event.type !== 'data'){
            ctx.sendNext(event);
            return;
        }
        ctx.stream.write(event.data);
        ctx.sendNext(event);
    }
}
