
// require mongoose and Meeting model
var models = require('./models');
var Meeting = models.Meeting;

//require underscore
var _ = require('underscore');

//QUESTION: Should I be searching with data.result.parameters or with pendingState?

// set an empty array to catch all conflicts, and another for resolutions
var conflict = [];
var resolutions = [];

// get the planned meeting duration
var duration = ( pendingState.endTime - pendingState.startTime )|| 60*60*1000;

// Search all meetings by invitees
// Loop through invitees
function findThatConflict(inviteeArray){
  inviteeArray.forEach(function(invitee){
    Meeting.find({userId: invitee}, function (err, found){
      if (err){
        console.log("Error finding user", err);
        return;
      } else if (!found){
        console.log("No such meetings found, you can set a meeting!");
        //send the user an interactive message so they can confirm or cancel the meeting
        web.chat.postMessage(message.channel, meetingResponse(parameters), messageObject);
        return;
      } else {
        // check that the times for this user's other meetings do not conflict
        var foundStart = (new Date(found.startTime)).toString();
        var foundEnd = (new Date(found.endTime)).toString();
        var pendingStart = (new Date(pendingState.startTime)).toString();
        if (found.date === pendingState.date && foundStart <= pendingState.startTime && foundEnd >= pendingStart ){
          console.log("This is a time conflict with ", found.userId);
          //store the meeting in an array of time conflicts
          conflict.push(found);
        }
      }
    })
  });
}

// Convert start and end times for each conflict to milliseconds
var conflictFix = conflict.map(function(meeting){
  var start = (new Date(meeting.startTime)).toString;
  var end = (new Date(meeting.endTime)).toString || (start + 30*60*1000);
  return {start: start, end: end, date: meeting.date};
});
// if new meeting start time falls within existing meeting times,
// find different times available for invitees
conflictFix.forEach(function(conflict){
  for (var j = 0; j < 3; j++) {

    for (var i = 0; i < 3; i++) {
      var newTimeSlot = {
        "text": (new Date(conflict.end + (duration * i))).toDateString(),
        "value": JSON.stringify({
          start: conflict.end + (duration * i),
          end: conflict.end + duration + (duration * i),
          date: conflict.date
        })
      };
      resolutions.push(newTimeSlot);
    }
  }
})

// send an interactive message with different times available to user
var responseObj = {
    "text": "When would you like to reschedule?",
    "response_type": "in_channel",
    "attachments": [
        {
            "text": "Choose a new meeting time",
            "fallback": "If you could read this message, you'd be picking a new time for that meeting.",
            "color": "#3AA3E3",
            "attachment_type": "default",
            "callback_id": "time_selection",
            "actions": [
                {
                    "name": "times_list",
                    "text": "Pick a time...",
                    "type": "select",
                    "options": resolutions.slice(0, 10)
                }
            ]
        }
    ]
}

var messageObject = {
  "text": "Would you like to play a game?",
  "attachments": [
    {
      "text": "Would you like to confirm?",
      "fallback": "You are unable to choose an action",
      "callback_id": "action",
      "color": "#3AA3E3",
      "attachment_type": "default",
      "actions": [
        {
          "name": "action",
          "text": "Confirm",
          "type": "button",
          "value": "confirm"
        },
        {
          "name": "action",
          "text": "Cancel",
          "type": "button",
          "value": "cancel"
        }
      ]
    }
  ]
}

var meetingResponse = function(parameters) {
  var dateStr = (new Date(parameters.date)).toDateString();
  var words = 'Schedule a meeting with ' + parameters.invitees + ' on ' + parameters.date + ' at ' + parameters.time;
  return words;
}


// when user clicks, make new meeting with the time from that timeslot

function resolveConflicts(parameters, user, message){
  // parse pendingState invitees, which is an array of slackIds
  var pendingState = JSON.stringify(user.pendingState);
  var invitees = pendingState.invitees;
  //transform invitee array with fullNames to an array of their slackIds from the database
  invitees.map(function(invitee){
    User.findOne({fullName: invitee}, function(err, found){
      if (found){
        return found.slackId;
      } else if (err){
        console.log("Error with database");
      } else {
        console.log("Error finding invitee");
      }
    })
  })
  findThatConflict(invitees);
  web.chat.postMessage(message.channel, meetingResponse(parameters), responseObject);

  //then, reset pending State
  user.pendingState = JSON.stringify({
    type: 'meeting',
    date: parameters.date,
    startTime: parameters.time[0], // startTime in time array
    endTime: parameters.time[1] || '', // endTime in time array
    invitees: parameters.invitees || '',
    description: parameters.subject || '',
    location: parameters.location || ''
  });

  user.save(function(err, found){
  console.log(found);
  if (err){
    console.log('error finding user with id', user._id);
    } else {
    console.log('user found and pending state set! yay.');
    }
  });

};


module.exports={
  resolveConflicts: resolveConflicts
}
