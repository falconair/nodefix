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

function Node(handler) {
    this.description = handler.description || "unnamed";
    this.incoming = handler.incoming || function (ctx, event) { if (ctx.next) { ctx.sendNext(event) };  };
    this.outgoing = handler.outgoing || function (ctx, event) { if (ctx.next) { ctx.sendNext(event) };  };
    this.next = null;
    this.prev = null;
}

function Pipeline(stream) {
    var self = this;
    this.first = null;
    this.last = null;
    this.state = {};

    this.addHandler = function (handler) {
        var node = new Node(handler);
        if (self.first === null) {
            self.first = node;
            self.last = node;
        }
        else {
            self.last.next = node;
            node.prev = self.last;
            self.last = node;
        }
    };

    this.pushIncoming = function (evt) {

        self.first.incoming(makeCtx(self.first, stream, true, self.state), evt);
    };

    this.pushOutgoing = function (evt) {

        self.last.outgoing(makeCtx(self.last, stream, false, self.state), evt);
    };

    this.pushIncomingData = function (data) {

        self.first.incoming(makeCtx(self.first, stream, true, self.state), {
            eventType: "data",
            data: data
        });
    };

    this.pushOutgoingData = function (data) {

        self.last.outgoing(makeCtx(self.last, stream, false, self.state), {
            eventType: "data",
            data: data
        });
    };


    this.toString = function () {
        var nodes = [];
        var node = self.first;
        while (node !== null) {
            nodes.push(node.description);
            node = node.next;
        }
        return nodes.join(","); //TODO add 'state' object to the output as well
    };

}


function makeCtx(node, stream, isIncoming, stateobj) {

    var incomingCtx = function (evt) {
        if (node.next) {
            node.next.incoming(makeCtx(node, stream, true, stateobj), evt);
        }
    };
    var outgoingCtx = function (evt) {
        if (node.prev) {
            node.prev.outgoing(makeCtx(node, stream, false, stateobj), evt);
        }
    };

    if (isIncoming) {
        return {
            sendNext: incomingCtx,
            sendPrev: outgoingCtx,
            stream: stream,
            state: stateobj
        };
    }
    else {
        return {
            sendNext: outgoingCtx,
            sendPrev: incomingCtx,
            stream: stream,
            state: stateobj
        };
    }
}

exports.makePipe = function (stream) {
    return new Pipeline(stream);
}
