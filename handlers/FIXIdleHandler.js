var logger = require("../lib/logger").createLogger();
var logger_format = require("../utils").logger_format;

exports.makeFIXIdleHandler = function(){ return new FIXIdleHandler();}

logger.format = logger_format;

function FIXIdleHandler(){

    var inctx = null;
    var outctx = null;
    
    var incomingTime = null;
    var outgoingTime = null;
    
    var heartBeatInt=null;
    
    var testReqId = 1;
    var isAwaitingTestReqResp = false;
    
    var intervalID = null;

    var self = this;
    

    this.description = "sends 'heartbeat' events every time seconds";
    
    this.incoming = function(ctx, event){
        self.inctx = ctx;

        if(event.eventType === "data"){
            incomingTime = new Date().getTime();
            
            var fix = event.data;

            //This is a logon message, containing heartbeat time
            if(fix["35"] === "A"){
                heartBeatInt = parseInt(fix["108"],10);
                outgoingTime = new Date().getTime();//Response to the logon probably already went
                intervalID = setInterval(callback,heartBeatInt * 1000);
                //console.log("setting interval:"+intervalID);
            }
            else if(fix["35"] === "0" && isAwaitingTestReqResp && testReqID === fix["112"]){
                isAwaitingTestReqResp = false;  //received the teset response we were waiting for
            }
        }

        ctx.sendNext(event);

    }

    this.outgoing = function(ctx, event){
        self.outctx = ctx;

        if(event.eventType=="data"){
            outgoingTime = new Date().getTime();
        }

        ctx.sendNext(event);
        
    }
    
    var callback = function(){
        var currentTime = new Date().getTime();
        //console.log("heartbeatInt:"+heartBeatInt+", outgoingTime:"+outgoingTime+", idle:"+(currentTime - outgoingTime)+", inctx:"+(self.inctx));

        //Send heartbeat if no message has been sent for 'heartBeatInt' seconds
        if((currentTime - outgoingTime) > heartBeatInt*1000){
            if(self.inctx !== null){
                self.inctx.sendPrev({eventType:"data", data:{"35":"0"}});            
            }
        }
        
        //Send test request if no message received by counter party for unexpectedly long time
        if ((currentTime - incomingTime) > (heartBeatInt * 1000 * 1.5) && isAwaitingTestReqResp === false) {
            if(self.inctx !== null){
                self.inctx.sendPrev({eventType:"data", data:{
                    "35": "1",
                    "112": (testReqId++) + ""
                }}); /*write testrequest*/
                isAwaitingTestReqResp = true;
            }
        }

        if (currentTime - incomingTime > heartBeatInt * 1000 * 3) {
            logger.error("[ERROR] No message received from counterparty and no response to test request.");
            self.inctx.stream.end();
            //console.log("clearing interval:"+intervalID);
            clearInterval(intervalID);
            return;
        }
    }
}


