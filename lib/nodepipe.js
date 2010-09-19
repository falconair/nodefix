/*
Copyright (c) 2010 Shahbaz Chaudhary

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.
*/

function Node(handler){
                this.description = handler.description || "unnamed";
                this.incoming = handler.incoming || function(ctx,event){ if(ctx.next){ctx.next(event)};};
                this.outgoing = handler.outgoing || function(ctx,event){ if(ctx.next){ctx.next(event)};};
                this.next = null;
                this.prev = null;
}

function Pipeline(stream){
                var self = this;
                this.first = null;
                this.last = null;
               
                this.addHandler = function(handler){
                                var node = new Node(handler);
                                if(self.first === null){
                                                self.first = node;
                                                self.last = node;
                                }
                                else{
                                                self.last.next = node;
                                                node.prev = self.last;
                                                self.last = node;
                                }
                };
                
                this.pushIncoming = function(evt){
                    self.first.incoming(makeCtx(self.first,stream,true),evt);
                };
 
                this.pushOutgoing = function(evt){
                    self.last.outgoing(makeCtx(self.last,stream,false),evt);
                };
                
                this.toString = function(){
                    var nodes = [];
                    var node = self.first;
                    while(node !== null){
                        nodes.push(node.description);
                        node = node.next;
                    }
                    return nodes.join(",");
                };

}
  
 
function makeCtx(node, stream, isIncoming){
 
                var incomingCtx = function(evt){
                    if(node.next){
                        node.next.incoming(makeCtx(node,true),evt);
                    }
                };
                var outgoingCtx = function(evt){
                    if(node.prev){
                        node.prev.outgoing(makeCtx(node,false),evt);
                    }
                };
               
                if(isIncoming){
                                return {forward:incomingCtx, reverse:outgoingCtx, stream:stream};
                }
                else{
                                return {forward:outgoingCtx, reverse:incomingCtx, stream:stream};
                }
}

exports.makePipe = function(stream){ return new Pipeline(stream); }

