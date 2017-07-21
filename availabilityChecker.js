function checkFreeBusy(userArray, auth, calendar, startTime, endTime) {
  var authTokens = userArray.map((user) => (user.google));
  var slot;
  var oneWeekFromStart = (new Date(startTime)).getTime() + 1*24*60*60*1000;
  var promisesArray = [];

  authTokens.forEach(token => {
    auth.setCredentials(token);
    var promise = new Promise (
      function(resolve, reject) {
      calendar.freebusy.query({
        auth: auth,
        headers: {"content-type": "application/json"},
        resource: {
          timeMin: startTime,
          timeMax: endTime,
          items: [{"id": "primary"}]
        }
      }, function(err, response){
        if (err) {
          reject(err);
        }
        else {
          resolve(response.calendars["primary"].busy === 0);
        }
      })
    }
    );
    promisesArray.push(promise);
  });
  return Promise.all(promisesArray);
}

// function checkFreeBusyAll(arrOfUsers, startTime, endTime){
//   return new Promise(function(resolve, reject){
//     var arrOfAuth =
//     Promise.all()
//   })
// }

function findTimes(userArray, auth, calendar, startTime, endTime) {

  checkFreeBusy(auth, calendar, startTime, endTime)
  .then()

  var availabilities = [];
  while (availabilities.length !== 10) {
    var ok = true;
    var slot;

    checkFreeBusy(auth, calendar, startTime, endTime))
    .then




    if (ok) {
      availabilities.push(Object.assign({}, {startTime, endTime}))
    }
    startTime = (new Date(startTime).getTime() + 30*60*1000).toISOString();
    endTime = (new Date(endTime).getTime() + 30*60*1000).toISOString();
  }
}

module.exports = {
  checkFreeBusy: checkFreeBusy
}
