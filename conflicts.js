
// require mongoose and Meeting model
var models = require('./models');
var Meeting = models.Meeting;

//QUESTION: Should I be searching with data.result.parameters or with pendingState?

// set an empty array to catch all conflicts, and another for resolutions
var conflict = [];
var resolutions = [];

// get the planned meeting duration
var duration = ( pendingState.endTime - pendingState.startTime )|| 60*60*1000

// parse pendingState invitees, which is an array of slackIds
var pendingState = JSON.stringify(user.pendingState)
var invitees = pendingState.invitees;

// Search all meetings by invitees
// Loop through invitees
invitees.forEach(function(invitee){
  Meeting.find({userId: invitee}, function (err, found){
    if (err){
      console.log("Error finding user", err);
      return;
    } else if (!found){
      console.log("No such meetings found, you can set a meeting!");
      //send the user an interactive message so they can confirm or cancel the meeting
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

// Convert start and end times for each conflict to milliseconds
var conflictFix = conflict.map(function(meeting){
  var start = (new Date(meeting.startTime)).toString;
  var end = (new Date(meeting.endTime)).toString || (start + 30*60*1000);
  return {start: start, end: end, date: meeting.date};
});
// if new meeting start time falls within existing meeting times,
// find different times available for invitees
conflictFix.forEach(function(conflict){
    for (var i = 0; i < 10; i++) {
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
                    "options": resolutions.slice(0,10)
                }
            ]
        }
    ]
}

web.chat.postMessage(message.channel, meetingResponse(data.result.parameters), responseObject);

// when user clicks, make new meeting with the time from that timeslot

function resolveConflicts(parameters, user){



};


module.exports={
  resolveConflicts: resolveConflicts
}
