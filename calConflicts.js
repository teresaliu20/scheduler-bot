var axios = require('axios');


var calendarList = (allFound, meeting) => {
  //declare variables to keep track of calendars and busy times
  var calendars;
  var busy;

  allFound.forEach((foundInvitee) => {
    oauth2Client.setCredentials({
      'access_token': foundInvitee.google.access_token,
      'refresh_token': foundInvitee.google.refresh_token
    });


    // send the ids in body of get request to freeOrBusy
    new Promise(
      axios.get('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        params: {
          minAccessRole: 'freeBusyReader'
        }
      })
    )
    .then((data) => {
      data.json()
    })
    .then((dataJson) => {
      calendars = dataJson.items;
    })
    .catch((err) => console.log("CalendarList error", err));
    var calendarIds = calendars.map((cal) => {
      return cal.id;
    });

    // pass ids to googleCal via a post request to calendarList.list
    new Promise(axios.post('https://www.googleapis.com/calendar/v3/freeBusy', {
      body: {
        "timeMin": meeting.date + meeting.startTime,
        "timeMax": meeting.date + meeting.endTime,
        "timeZone": "America/Los_Angeles",
        "calendarExpansionMax": 2,
        "items": calendarIds
      },
      headers: {
        "content-type" : "application/json"
      }
    })
    .then((response) => {
      response.json()
    })
    .then((responseJson) => {
      console.log("RESPONSE FROM FREEBUSY", responseJson);
      busy = responseJson.calendars.(key).busy;
    })
    .catch((error) => {
      console.log("ERROR FROM FREEBUSY", error);
    }));
  })
}

conflictFind = (user, message) => {
  // take the list of invitees and search database for their google credentials
  var invitees = JSON.parse(user.pendingState).invitees;
  var allFound = [];
  invitees.forEach((invitee) => {
    user.findOne({slackId: invitee}, (error, foundInvitee) => {
      if (error){
        console.log("Error finding invitee");
        return;
      } else if (!foundInvitee){
        rtm.sendMessage('No such user was found in the database', message.channel);
        return;
      } else {
        allFound.push(foundInvitee);
      }
    })
  });
  calendarList(allFound, meeting);
}

module.exports = {
  conflictFind: conflictFind
}
