// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TeamsActivityHandler, TeamsInfo, TurnContext, CardFactory } = require("botbuilder");
const ACData = require("adaptivecards-templating");
const notificationCardJson = require('../resources/SendTargetNotificationCard.json');

/**
 * TeamsBot class handles Teams activity events and sends notifications.
 */
class TeamsBot extends TeamsActivityHandler {
    constructor() {
        super();
        this.baseUrl = process.env.BaseUrl;
        this.appId = process.env.MicrosoftAppId;

        // This method is invoked whenever there is any message activity in bot's chat.
        this.onMessage(async (context, next) => {
            const members = [];
            const meetingId = context._activity.channelData?.meeting?.id;

            if (!meetingId) {
                await context.sendActivity("Meeting ID not found in the context.");
                return;
            }

            if (context.activity.value == null) {
                TurnContext.removeRecipientMention(context._activity);

                const userText = context._activity.text?.trim();

                if (userText === "SendNotification") {
                    try {
                        const pagedMembersResult = await TeamsInfo.getPagedMembers(context);
                        const meetingMembers = pagedMembersResult.members || [];
                        const tenantId = context._activity.channelData?.tenant?.id;

                        if (!tenantId) {
                            await context.sendActivity("Tenant ID not found in the context.");
                            return;
                        }

                        for (const member of meetingMembers) {
                            try {
                                const participantDetail = await TeamsInfo.getMeetingParticipant(context, meetingId, member.aadObjectId, tenantId);

                                // Select only those members that are present when the meeting starts.
                                if (participantDetail?.meeting?.inMeeting) {
                                    members.push({ id: participantDetail.user.id, name: participantDetail.user.name });
                                }
                            } catch (error) {
                                console.error(`Failed to get meeting participant for member ${member.name}:`, error);
                                // Optionally continue without throwing
                            }
                        }

                        if (members.length > 0) {
                            await context.sendActivity({ attachments: [this.createMembersAdaptiveCard(members)] });
                        } else {
                            await context.sendActivity("No members are currently in the meeting.");
                        }
                    } catch (err) {
                        console.error("[SendNotification Error]:", err);
                        await context.sendActivity("An error occurred while sending notifications.");
                    }
                } else {
                    await context.sendActivity("Please type `SendNotification` to send In-meeting notifications.");
                }
            } else if (context.activity.value.Type === "StageViewNotification") {
                const adaptiveCardChoiceSet = context.activity.value.Choice;
                const selectedMembers = adaptiveCardChoiceSet.split(",");
                this.stageView(context, meetingId, selectedMembers);
            } else if (context.activity.value.Type === "AppIconBadging") {
                const adaptiveCardChoiceSet = context.activity.value.Choice;
                const selectedMembers = adaptiveCardChoiceSet.split(",");
                this.visualIndicator(context, meetingId, selectedMembers);
            }

            await next();
        });
    }

    /**
     * Sends a targeted meeting notification to the stage view.
     * @param {TurnContext} context - The context object for the current turn.
     * @param {string} meetingId - The ID of the meeting.
     * @param {Array} selectedMembers - The list of selected members.
     */
    async stageView(context, meetingId, selectedMembers) {
        const notificationInformation = {
            type: "targetedMeetingNotification",
            value: {
                recipients: selectedMembers,
                surfaces: [
                    {
                        surface: "meetingStage",
                        contentType: "task",
                        content: {
                            value: {
                                height: "300",
                                width: "400",
                                title: "Targeted meeting Notification",
                                url: `${this.baseUrl}/hello.html`
                            }
                        }
                    }
                ]
            }
        };

        try {
            await TeamsInfo.sendMeetingNotification(context, notificationInformation, meetingId);
        } catch (exception) {
            console.log(exception);
        }
    }

    /**
     * Sends an app icon badging notification.
     * @param {TurnContext} context - The context object for the current turn.
     * @param {string} meetingId - The ID of the meeting.
     * @param {Array} selectedMembers - The list of selected members.
     */
    async visualIndicator(context, meetingId, selectedMembers) {
        const notificationInformation = {
            type: "targetedMeetingNotification",
            value: {
                recipients: selectedMembers,
                surfaces: [
                    {
                        surface: "meetingTabIcon"
                    }
                ]
            }
        };

        try {
            await TeamsInfo.sendMeetingNotification(context, notificationInformation, meetingId);
        } catch (exception) {
            console.log(exception);
        }
    }

    /**
     * Creates an adaptive card with a list of in-meeting participants.
     * @param {Array} members - The list of members.
     * @returns {Attachment} - The adaptive card attachment.
     */
    createMembersAdaptiveCard(members) {
        const templatePayload = notificationCardJson;
        const template = new ACData.Template(templatePayload);

        const cardPayload = template.expand({
            $root: {
                members: members
            }
        });

        return CardFactory.adaptiveCard(cardPayload);
    }
}

module.exports.TeamsBot = TeamsBot;