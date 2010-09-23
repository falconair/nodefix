exports.makeFIXMsgWriter = function(){ return new FIXMsgWriter();}

function FIXMsgWriter(){
    this.description = "writes fix string to stream";
    
    this.outgoing = function(ctx, event){
        
        if(event.eventType !== "data"){
            ctx.next(event);
        }
        
        ctx.stream.write(event.data);

    }
}
