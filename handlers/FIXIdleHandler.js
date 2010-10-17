exports.makeFIXIdleHandler = function(){ return new FIXIdleHandler();}

function FIXIdleHandler(){

    var inctx = null;
    var outctx = null;
    
    var incomingTime = null;
    var outgoingTime = null;
    
    var heartBeatInt=null;

    var self = this;
    

    this.description = "sends 'heartbeat' events every time seconds";
    
    this.incoming = function(ctx, event){
        self.inctx = ctx;

        if(event.eventType === "data"){
            incomingTime = new Date().getTime();
            
            var fix = event.data;
            if(fix["35"] === "A"){
                //This is a logon message, containing heartbeat time
                heartBeatInt = parseInt(fix["108"],10);
                outgoingTime = new Date().getTime();//Response to the logon probably already went
                setInterval(callback,heartBeatInt * 1000);
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

        if((currentTime - outgoingTime) > heartBeatInt*1000){
            if(self.inctx !== null){
                self.inctx.sendPrev({eventType:"data", data:{"35":"0"}});            
            }
        }
    }
}


