var axios = require('axios');


var calendarList = () => {
  oauth2Client.setCredentials({
      'access_token': foundInvitee.google.access_token,
      'refresh_token': foundInvitee.google.refresh_token
  });
  var calendars;
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
  new Promise(axios.post('https://www.googleapis.com/calendar/v3/freeBusy', {
    body: {
      "timeMin": datetime,
      "timeMax": datetime,
      "timeZone": string,
      "calendarExpansionMax": 2,
      "items": calendarIds
    }
  }))

}

// take the list of invitees and search database for their google credentials
var invitees = JSON.parse(user.pendingState).invitees;
invitees.forEach((invitee) => {
  user.findOne({email: invitee}, (error, foundInvitee) => {
    if (error){
      console.log("Error finding invitee");
    } else if (!foundInvitee){
      rtm.sendMessage('No such user was found in the database', message.channel);
    } else {

      // use google credentials to get google ids

    }
  })
})
// pass ids to googleCal via a post request to calendarList.list
app.post()
// send these ids in body of get request to freeOrBusy
