function checkFreeBusy(userArray, auth, calendar, startTime, endTime) {
  var availabilities = [];

  var authTokens = userArray.map((user) => (user.google));
  // var oneWeekFromStart = (new Date(startTime)).getTime() + 1*24*60*60*1000;
  authTokens.forEach(token => {
    auth.setCredentials(token);
    calendar.freebusy.query({
      auth: auth,
      headers: {"content-type": "application/json"},
      resource: {
          timeMin: startTime,
          timeMax: endTime,
          items: [{"id": "primary"}]
      },
    }, function(err, response) {
      console.log("RESPONSE: ", response)
      var events = response.calendars["primary"].busy;
      if (events.length === 0) {
          console.log("THIS PERSON IS NOT BUSY", events);
      }
      else {
          console.log("THIS PERSON IS BUSY", events);
      }
    })
  })
}

module.exports = {
  checkFreeBusy: checkFreeBusy
}