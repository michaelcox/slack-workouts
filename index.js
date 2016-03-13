var moment = require('moment-timezone');
var AWS = require('aws-sdk');
var qs = require('qs');
var app = require('./app');

var token;
var kmsEncyptedToken = 'YOUR_KEY_GOES_HERE';

// Monday should be the first day of the week
moment.locale('en', {
    week : {
        dow : 1
    }
});

var startOfWeek = moment().tz('America/New_York').startOf('week').format('YYYY-MM-DD');
var dayIndex = moment().tz('America/New_York').isoWeekday() - 1;

function slackError(message) {
    return {
        text: 'There was an error while saving your workout',
        attachments: [{
            fallback: message,
            color: 'danger',
            text: message
        }]
    }
}

function slackRemovedWorkout() {
    return {
        text: 'Your workout has been removed for today.'
    }
}

function slackPostedWorkout(message, username) {
    return {
        response_type: 'in_channel',
        text: username + ' posted a new workout!',
        attachments: [{
            fallback: username + ' posted a new workout!',
            mrkdwn_in: ['text'],
            text: message
        }]
    }
}

function processEvent(event, context) {
    var body = event.body;
    var params = qs.parse(body);

    var username = params.user_name;
    var command = params.text;
    var responseUrl = params.response_url;
    var channelName = params.channel_name;

    if (!username) {
        return context.done(null, slackError('There was no username provided'));
    }

    var workoutComplete = (command === 'false') ? false : true;

    app.updateUserWorkout(username, startOfWeek, dayIndex, workoutComplete, function(err, results) {
        if (err) {
            return context.done(null, slackError(err.message));
        }
        if (workoutComplete) {
            context.done(null, slackPostedWorkout(results.format, username));
        } else {
            context.done(null, slackRemovedWorkout());
        }
    });
}

// Setup the Lambda POST handler
exports.handler = function(event, context) {
    if (token) {
        // Container reuse, simply process the event with the key in memory
        processEvent(event, context);
    } else if (kmsEncyptedToken) {
        var encryptedBuf = new Buffer(kmsEncyptedToken, 'base64');
        var cipherText = {CiphertextBlob: encryptedBuf};

        var kms = new AWS.KMS();
        kms.decrypt(cipherText, function (err, data) {
            if (err) {
                console.log('Decrypt error: ' + err);
                context.fail(err);
            } else {
                token = data.Plaintext.toString('ascii');
                processEvent(event, context);
            }
        });
    } else {
        context.fail('Token has not been set.');
    }
}
