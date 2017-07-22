var _ = require('underscore');

/**
 * Checks the individual busy times of each invitee for the week using Google Calendar API checkFreeBusy
 * and gives back a promise of all the queries from each user's calendars
 * @param  {array}    userArray   Array of users invited to meeting from database
 * @param  {object}   auth        Google OAuth2 Client object
 * @param  {object}   calendar    Google calendar object
 * @param  {Date}     startTime   Starting time of the meeting to be scheduled
 * @return {promise}              Returns an array of promises that resolve with an array of objects
 *                                containing invitee's busy times, with start and end as keys
 */
function checkFreeBusyForWeek(userArray, auth, calendar, startTime) {
  var authTokens = userArray.map((user) => (user.google)); // Map each user to their google auth object
  var oneWeekFromStart = (new Date(startTime)).getTime() + 7*24*60*60*1000; // Calculate one week from start time of meeting
  var promisesArray = []; // Store promises from freebusy query

  // For each user's auth token, generate all the user's busy times from their primary calendar
  authTokens.forEach(token => {
    auth.setCredentials(token);
    var promise = new Promise (
      function(resolve, reject) {
      calendar.freebusy.query({
        auth: auth,
        headers: {"content-type": "application/json"},
        resource: {
          timeMin: startTime,
          timeMax: (new Date(oneWeekFromStart)).toISOString(),
          items: [{"id": "primary"}]
        }
      }, function(err, response){
        if (err) {
          reject(err);
        }
        else {
          resolve(response.calendars["primary"].busy); // Returns an array of objects of start and end of their busy times
        }
      })
    });
    promisesArray.push(promise); // Store the promise
  });
  return Promise.all(promisesArray); // Return a promise of all the promises of the array
}
/**
 * Combines all the busy times created by checkFreeBusy() and finds the times 
 * that every invitee is available during that week, with a maximum of 3 time slots per day
 * @param  {array}            userArray [description]
 * @param  {object}           auth      [description]
 * @param  {object}           calendar  [description]
 * @param  {ISOSTring Date}   startTime [description]
 * @param  {ISOSTring Date}   endTime   [description]
 * @return {array}            Returns the array containing each time slot that works with everyone's
 *                            schedule, represented by objects containing a start time and an end time    
 */
function checkAvailabilities(userArray, auth, calendar, startTime, endTime) {
  var possibleTimeSlots = [];
  // Checks the availability of each invitee for the whole week
  return checkFreeBusyForWeek(userArray, auth, calendar, startTime)
  .then((userBusyTimesArray) => {
    // var condensedBusyTimes = _.union(userBusyTimesArray); // Puts everyone's busy times into one array
    var condensedBusyTimes = _.uniq(_.flatten(userBusyTimesArray, true, true))
    // Converts all ISO String Dates to miliseconds
    condensedBusyTimes = condensedBusyTimes.map((busyTime) => {
      return {
        start: (new Date(busyTime.start)).getTime(),
        end: (new Date(busyTime.end)).getTime()
      }
    })
    // Groups the busy times by start times
    var groupedStartTimes = _.groupBy(condensedBusyTimes, (busyTime) => {
      return busyTime.start;
    })

    var squishedBusyTimes = []; // Events without overlaps according to start times
    // Iteratees through each group of start times to find event with latest end time
    _.forEach(groupedStartTimes, (eventsAtStartTime) => {
      var longestEventAtStart = _.max(eventsAtStartTime, (event) => {
        return event.end;
      })
      squishedBusyTimes.push(longestEventAtStart);
    })
    squishedBusyTimes = squishedBusyTimes.sort((timeSlot1, timeSlot2) => {
      return timeSlot1.start - timeSlot2.start;
    })

    forTheLog = squishedBusyTimes.map((busyTime) => {
      return {
        start: (new Date(busyTime.start)).toLocaleString(),
        end: (new Date(busyTime.end)).toLocaleString()
      }
    })
    // Loop through the busy times sorted by start time to find time slots that overlap, remove overlapping times
    for (var i = 0; i < squishedBusyTimes.length-1; i++) {
      var currentTime = squishedBusyTimes[i]; // Current time slot to examine
      var nextTime = squishedBusyTimes[i+1]; // Next time slot to compare to current time
      // If there is an overlap, and the next time slot's end is later, combine times and replace in array
      if (nextTime.start <= currentTime.end && nextTime.end > currentTime.end) {
        var combinedTime = {
          start: currentTime.start,
          end: nextTime.end
        };
        // currentTime[i] = combinedTime; // Replace at index i with the combined time
        // console.log("COMBINING REPLACED TIME: ------> ", {start: (new Date(currentTime[i].start).toLocaleString()), end: (new Date(currentTime[i].end).toLocaleString())});
        var takeOut = squishedBusyTimes.splice(i, 2, combinedTime); // Remove nextTime from array
        // console.log("WHAT YOU TOOK OUT: ", {start: (new Date(takeOut[.start).toLocaleString()), end: (new Date(currentTime[i].end).toLocaleString())}););
        forTheLog = squishedBusyTimes.map((busyTime) => {
          return {
            start: (new Date(busyTime.start)).toLocaleString(),
            end: (new Date(busyTime.end)).toLocaleString()
          }
        })
        i--; // Account for removing the next item
      }
      // If nextTime is contained within currentTime, remove nextTime completely
      else if (nextTime.start < currentTime.end && nextTime.end < currentTime.end) {
        squishedBusyTimes.splice(i+1, 1); // Remove nextTime from array
        i--; // Account for removing the next item
      }
      // At this point, currentTime and nextTime do not overlap, continue in array
    }
    forTheLog = squishedBusyTimes.map((busyTime) => {
      return {
        start: (new Date(busyTime.start)).toLocaleString(),
        end: (new Date(busyTime.end)).toLocaleString()
      }
    })

    var meetingStartTime = (new Date(startTime)).getTime(); // Starting time of event in miliseconds
    var meetingDuration = (new Date(endTime)).getTime() - (new Date(startTime)).getTime(); // Duration of event in miliseconds

    for (var i = 0; i < squishedBusyTimes.length-1; i++) {

      var currentTime = squishedBusyTimes[i]; // Current time slot
      var nextTime = squishedBusyTimes[i+1]; // Next time slot
      var gap = nextTime.start - currentTime.end; // Calculate the available time between busy times
      // If there is enough time for the meeting
      if (gap >= meetingDuration) {
        // Store the new starting times
        var newStartTime = currentTime.end;
        // While there is time in the gap to create a new time slot
        while (newStartTime + meetingDuration < nextTime.start) {
          var startTimeDate = new Date(newStartTime) // Get the start time in date form
          // If the start time is between 9am and 5pm, create a new time slot for availability
          if (startTimeDate.getHours() > 9 && startTimeDate.getHours() <= 17) {
            let timeSlot = {
              start: new Date(newStartTime).toLocaleString(),
              end: (new Date(newStartTime + meetingDuration)).toLocaleString()
            }
            possibleTimeSlots.push(timeSlot); // Push time slot into array of possible meeting times
          }
          newStartTime += 60*60*1000; // Increment the new time slot to check the next time slot in gap
        }
      }
    }
    // To reduce the possible time slots to a maximum of three per day, first group by date
    var groupedByDate = _.groupBy(possibleTimeSlots, (possibleTimeSlot) => {
      return (new Date(possibleTimeSlot.start)).getDate();
    })
    // Create a final array that will contain the possible time slots, max 3 per day, over the next 7 days
    var finalPossibleTimeSlots = [];
    // For each group, go through the array of available time slots during that day
    _.forEach(groupedByDate, (day) => {
      // Push the first three time slots into the final array
      for (var i = 0; i < 3 && i < day.length; i++) {
        console.log("PUSH", day[i]);
        finalPossibleTimeSlots.push(day[i]);
      }
    })
    // Return the final array
    return finalPossibleTimeSlots;
  })
  .catch(err => {
    console.log("ERROR HERE: ", err);
  })
}

module.exports = {
  checkAvailabilities: checkAvailabilities
}
