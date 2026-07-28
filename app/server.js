let express = require("express");
let axios = require("axios");
let path = require("path");

let app = express();

let hostname = "localhost";
let port = 3000;

let env = require("../env.json");

app.use(express.static(path.join(__dirname, "public")));

app.get("/games", async function (req, res) {
    try {
        let now = new Date();

        let startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        let startOfTomorrow = new Date(startOfToday);
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

        let options = {
            method: "GET",
            url: env.api_url,
            params: {
                apiKey: env.api_key,
                leagueID: "MLB",
                startsAfter: startOfToday.toISOString(),
                startsBefore: startOfTomorrow.toISOString(),
                finalized: false,
                oddsAvailable: true,
                limit: 20
            }
        };

        let response = await axios.request(options);

        let events = response.data.data;

        let games = events.map(function (event) {
            let allOdds = Object.values(event.odds || {});

            let awayMoneyline = allOdds.find(function (odd) {
                return (
                    odd.betTypeID === "ml" &&
                    odd.periodID === "game" &&
                    odd.sideID === "away"
                );
            });

            let homeMoneyline = allOdds.find(function (odd) {
                return (
                    odd.betTypeID === "ml" &&
                    odd.periodID === "game" &&
                    odd.sideID === "home"
                );
            });

            return {
                eventID: event.eventID,
                date: event.status.startsAt,

                awayTeamName: event.teams.away.names.long,
                homeTeamName: event.teams.home.names.long,

                awayTeamID: event.teams.away.teamID,
                homeTeamID: event.teams.home.teamID,

                // if/else to check if odds are available, if not, return "N/A"
                awayOdds: awayMoneyline
                    ? awayMoneyline.bookOdds
                    : "N/A",

                homeOdds: homeMoneyline
                    ? homeMoneyline.bookOdds
                    : "N/A"
            };
        });

        console.log("Games being sent to browser:");
        console.log(games);

        res.json(games);
    }
    catch (error) {
        console.error(
            error.response
                ? error.response.data
                : error.message
        );

        res.status(500).json({
            success: false,
            error: error.response
                ? error.response.data
                : error.message
        });
    }
});

app.listen(port, hostname, function () {
    console.log(`Listening at http://${hostname}:${port}`);
});