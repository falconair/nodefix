exports.makeFIXInitiatorLogonHandler = function(options){ return new FIXInitiatorLogonHandler(options);}

function FIXMsgCreator(opt){


    this.description = "if this is an acceptor session, then received logon messages need to ack";
    
    this.incoming = function(ctx, event){
        if(event.eventType !== "data"){
            ctx.sendNext(event);
        }
        
        ctx.sendPrev({eventType:"data", data:{
                            "35": "A",
                            "108": ctx.state.HeartbtInt || 30 //TODO this needs to be double checked
                        }});    
    }

