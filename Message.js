var _ = require("underscore");
var map = require("./map");
var SOHCHAR = String.fromCharCode(1);

function Message() {}

Message.prototype.getType = function () {
    return this.get("MsgType");
};

Message.prototype.get = function (field) {

    var rawValue = this.getKey(field),
        arr = [];

    if (!rawValue) {
        return null;
    } else if (typeof rawValue === "string") {

        return map.get(field, rawValue);

    // Assume it's an array (repeating group)
    } else {
        rawValue.forEach(function (rawValue) {
            arr.push(map.get(field, rawValue));
        });
        return arr;
    }
};

// Returns field value, or array of repeating group field values
Message.prototype.getKey = function (field) {

    // TODO for performance could include logic to quickly return value if known not to be a repeating group field (header, etc)
    var arr = _.reduce(this.data, function (memo, item) {
        if (item[0] === field) {
            memo.push(item[1]);
        }
        return memo;
    }, []);

    if (arr.length === 0) {
        return null;
    } else if (arr.length === 1) {
        return arr[0];
    } else {
        return arr;
    }
};

// Second argument can be an array of field names or a single field name
Message.prototype.getRepeating = function (keyField, fields) {
    var keys = this.get(keyField),
        data = {},
        obj = {};

    if (typeof fields === "string") {
        data = this.get(fields);
    } else {
        fields.forEach(function (field) {
            data[field] = this.get(field);
        }.bind(this));
    }
    keys.forEach(function (key, index) {
        obj[key] = {};
        for (var field in data) {
            if (typeof fields === "string") {
                obj[key] = data[index];
            } else {
                if (typeof data[field][index] !== "undefined") {
                    obj[key][field] = data[field][index];
                }
            }
        }
    });
    return obj;
};

Message.prototype.getFIX = function () {
    return this.raw;
};

module.exports = Message;







// function convert(data) {
//     var obj = {};
//     for (var field in data) {
//         if (data.hasOwnProperty(field)) {
//             if (field !== '') {
//                 obj[fixFields.keyvals[field]] = data[field];
//             }
//         }
//     }
//     return obj;
// }

// function makeReadable(data) {

//     var obj = {};

//     if (data['35'] === '3') {
//         console.warn('REJECTED', data['58'])
//     }
//     // data["35"] = data["35"] + " (" + msgTypes[data["35"]] + ")";
//     // if (data["263"]) {
//     //  data["263"] = data["263"] + " (" + subscriptionRequestTypes[data["263"]] + ")";
//     // }

//     for (var field in data) {
//         if (data.hasOwnProperty(field)) {
//             if (field !== '') {
//                 if (fieldDetails[field]) {
//                     obj["(" + field + ") " + fixFields.keyvals[field]] = data[field] + " (" + fieldDetails[field][data[field]] + ")";
//                 } else {
//                     obj["(" + field + ") " + fixFields.keyvals[field]] = data[field];
//                 }
//             }
//         }
//     }


//     return obj;
// }