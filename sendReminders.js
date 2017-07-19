#!/usr/bin/env node
var Reminder = require('./models').Reminder;
var mongoose = require('mongoose');
var RtmClient = require('@slack/client').RtmClient;
var bot_token = process.env.SLACK_BOT_TOKEN || '';
var rtm = new RtmClient(bot_token);
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;

var connect = process.env.MONGODB_URI || '';
mongoose.connect(connect);

rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
  rtm.sendMessage("Beep.", 'D6AS82SQ6');
  var today = new Date().toISOString().substring(0, 10); // change today's date to 'yyyy-mm-dd' format
  var tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().substring(0, 10); // change tomorrow's date to 'yyyy-mm-dd' format
  console.log('HERE');
  Reminder.find({date: {$in: [today, tomorrow]}}, function(err, reminders) { // find all reminders due today or tomorrow
    console.log('here');
    if (err) {
      console.log(err);
    }
    else {
      console.log('ALL REMINDERS:', reminders);
      reminders.forEach((reminder) => {
        console.log('rtm.getDMByUserId:', rtm.dataStore.getDMByUserId(reminder.userId));
        var dm = rtm.dataStore.getDMByUserId(reminder.userId); // dm object by userId
        var channel = dm.id; // dm channel by userId
        var date = (reminder.date === today? "today" : "tomorrow") // converts date to string 'today' or 'tomorrow'
        rtm.sendMessage('Reminder: You need to ' + reminder.subject + ' ' + date, channel) // send message to DM
      })
      rtm.disconnect();
      mongoose.connection.close();
    }
  })
});

rtm.start();
