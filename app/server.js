let express = require("express");
let axios = require("axios");
let path = require("path");

let app = express();

let hostname = "localhost";
let port = 3000;

let env = require("../env.json");

app.use(express.static(path.join(__dirname, "public")));
/*
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
*/
app.get("/teams", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/players", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/teams", async function (req, res) {
    let teams = [{teamID: "1", name: "Team 1", wins: "City 1", losses: "State 1"}];

    if (!teams || teams.length === 0) {
        res.status(404).json({
            success: false,
            error: "No team found"
        });
    } else {
        res.json(teams);
    }
});

app.get("/api/players", async function (req, res) {
    let players = [{playerID: "1", name: "Player 1", team: "1", position: "Pitcher"}];

    if (!players || players.length === 0) {
        res.status(404).json({
            success: false,
            error: "No player found"
        });
    } else {
        res.json(players);
    }
});

app.get("/how-to", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, hostname, function () {
    console.log(`Listening at http://${hostname}:${port}`);
});