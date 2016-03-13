var AWS = require('aws-sdk');
var async = require('async');

var docClient = new AWS.DynamoDB.DocumentClient({
    apiVersion: '2012-08-10',
    region: 'us-east-1'
});

function formatByWeek(item) {
    // Save a list of all users participating this week
    var usernames = [];
    Object.keys(item).forEach(function(key) {
        if (key !== 'weekstart') {
            usernames.push(key);
        }
    });

    // Get the length of the longest username, and add a bit of padding
    var nameFieldLength = usernames.sort(function (a, b) {
        return b.length - a.length;
    })[0].length + 2;

    var lines = ['```'];

    // Format a header line wtih days of the week
    var headerLine = 'This Week';
    if (headerLine.length < nameFieldLength) {
        headerLine += Array(nameFieldLength - headerLine.length).join(' ');
    }
    headerLine += '| M | T | W | T | F | S | S |';
    lines.push(headerLine);

    // Loop through each user and render a line for each day of the week
    usernames.forEach(function(key) {
        var line = key;
        if (key.length < nameFieldLength) {
            line += Array(nameFieldLength - key.length).join(' ');
        }
        item[key].forEach(function(day, index) {
            line += '|';
            if (day === true) {
                line += ' ✓ ';
            } else {
                line += '   ';
            }
            if (index === (item[key].length - 1)) {
                line += '|';
            }
        });
        lines.push(line);
    });

    lines.push('```');

    return lines.join('\n');
}

function updateUserWorkout(username, startOfWeek, dayIndex, workoutComplete, callback) {

    var tableName = 'slackworkouts';

    async.auto({
        existing: function(cb) {
            docClient.get({
                TableName: tableName,
                Key: {
                    weekstart: startOfWeek
                }
            }, function(err, result) {
                if (err) {
                    return cb(err);
                }
                if (result && result.Item) {
                    return cb(null, result.Item);
                }
                return cb(null, null);
            })
        },
        create: ['existing', function(cb, results) {
            var usernames = results.usernames;
            var existing = results.existing;

            var initialState = [null, null, null, null, null, null, null].slice();
            var item;

            if (existing) {
                item = existing;
            } else {
                item = {
                    weekstart: startOfWeek
                }
            }

            // Update this user with their workout for the day
            item[username] = item[username] || initialState;
            item[username][dayIndex] = workoutComplete;

            docClient.put({
                TableName: tableName,
                Item: item
            }, function(err) {
                cb(err, item);
            });
        }],
        format: ['create', function(cb, results) {
            var item = results.create;
            cb(null, formatByWeek(item));
        }]
    }, callback);

}

module.exports = {
    updateUserWorkout: updateUserWorkout
};
