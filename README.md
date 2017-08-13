# Scheduler Bot
### Created in July 2017

## Team
- Demi Adeboye
- Minh To
- Teresa Liu

## About
Scheduler Bot is a Slack bot that plans meetings and reminders for slack teams. Simply start a conversation with our bot, asking to set a reminder or meeting along with a date time and invites, and the bot will create the Google Calendar event for you after asking for confirmation. This bot is meant to make anything from scheduling one-on-one coffee or lunch breaks to reminders for deadlines much easier by efficiently integrating the process into Slack conversations.

## Technologies Used
### APIs
- API.AI to create a natural conversation flow between user and bot, trained to recognize slack team members, dates, times, and locations
- Google Calendar API and OAuth to link users to their google accounts, in order to access the Calendar API and send invites to team members' calendars
### Backend
- MongoDB
- Node.js and Express.js

## Screenshots
#### Google authentication to link new users to their Google Accounts
<img width="679" alt="screen shot 2017-08-03 at 10 01 51 am" src="https://user-images.githubusercontent.com/22362476/29253655-03979d8a-8038-11e7-80d8-636510796578.png">

#### Creating a meeting with natural conversation, processed through API.AI
<img width="681" alt="screen shot 2017-08-03 at 10 02 40 am" src="https://user-images.githubusercontent.com/22362476/29253657-039cf046-8038-11e7-95c5-072a6c277094.png">

#### Breakdown of conversation to make sure essential details of meeting are in place to create Google Calendar event
<img width="678" alt="screen shot 2017-08-03 at 10 02 29 am" src="https://user-images.githubusercontent.com/22362476/29253656-039adb4e-8038-11e7-9645-90e63e1a5158.png">
