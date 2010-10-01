//var dirtyStore = require('dirty');
var logger = require("../lib/logger").createLogger();
var tags = require('../resources/fixtagnums').keyvals;


var SOHCHAR = require("../utils").SOHCHAR;
var logger_format = require("../utils").logger_format;
var checksum = require("../utils").checksum;

exports.makeFIXMsgDecoder = function(options){ return new FIXMsgDecoder(options);}

logger.format = logger_format;

function FIXMsgDecoder(opt){


    this.description = "fix parser: accepts fix messages, creates key/tag vals";
    this.incoming = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.sendNext(event);
        }
        
        var msg = event.data;
        var stream = ctx.stream;
        
        //====Step 2: Validate message====
            var calculatedChecksum = checksum(msg.substr(0,msg.length - 7));
            var extractedChecksum = msg.substr(msg.length - 4, 3);
            
            if (calculatedChecksum !== extractedChecksum) {
                logger.warn("[WARNING] Discarding message because body length or checksum are wrong (expected checksum: "+calculatedChecksum+", received checksum: "+extractedChecksum+"): [" + msg+"]");
                return;
            }

            //====Step 3: Convert to map====
            var keyvals = msg.split(SOHCHAR);
            //sys.debug("keyvals:"+keyvals);
            var fix = {};
            for (var kv in Object.keys(keyvals)) {
                //if (keyvals.hasOwnProperty(kv)) {
                    var kvpair = keyvals[kv].split("=");
                    fix[kvpair[0]] = kvpair[1];
                    //console.log(kvpair[0] + "=" + kvpair[1]);
                //}
            }

            //====Step 4: Confirm all required fields are available====
            for (var f in Object.keys(headers)) {
                //if (headers.hasOwnProperty(f)) {
                    var tag = headers[f];
                    if (tag.charAt(tag.length - 1) != "?" && fix[tag] === undefined) { //If tag is required, but missing
                        logger.error("[ERROR] tag '" + tag + "' is required but missing in incoming message: " + msg);
                        if (loggedIn) {
                            ctx.sendPrev({
                                "35": "3",
                                "45": fix[tags["MsgSeqNum"]],
                                "58": "MissingTags"
                            }); /*write session reject*/
                        }
                        else {
                            stream.end();
                            return;
                        }
                    }
                //}
            }

            for (var f in Object.keys(trailers)) {
                //if (trailers.hasOwnProperty(f)) {
                    var tag = trailers[f];
                    if (tag.charAt(tag.length - 1) != "?" && fix[tag] === undefined) { //If tag is required, but missing
                        logger.error("[ERROR] tag " + tag + " is required but missing in incoming message: " + msg);
                        if (loggedIn) {
                            ctx.sendPrev({
                                "35": "3",
                                "45": fix[tags["MsgSeqNum"]],
                                "58": "MissingTags"
                            }); /*write session reject*/
                        }
                        else {
                            stream.end();
                            return;
                        }
                    }
                //}
            }

            ctx.sendNext({eventType:"data", data:fix});
    }
}



