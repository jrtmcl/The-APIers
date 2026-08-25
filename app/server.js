let express = require("express");
let axios = require("axios");
let path = require("path");
let bycrypt = require("bcrypt");
let stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
let pg = require("pg");

let app = express();

let hostname = "0.0.0.0";
let port = process.env.PORT || 3000;
let season = 2026;

let MLB_TEAMS_URL =
    "https://statsapi.mlb.com/api/v1/teams?sportId=1&season=" + season;

let env = {
    api_key: process.env.API_KEY,
    api_url: process.env.API_URL
};

let pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,

});


app.post(
    "/stripe-webhook",
    express.raw({ type: "application/json" }),
    function (req, res) {

        let signature = req.headers["stripe-signature"];
        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            );
        }
        catch (error) {
            console.log(error.message);

            res.status(400).send(
                "Webhook Error: " + error.message
            );

            return;
        }

        if (event.type === "checkout.session.completed") {

            let session = event.data.object;
            let userId = session.metadata.user_id;
            let amount = session.amount_total / 100;

            pool.query(
                "SELECT * FROM transactions WHERE stripe_session_id = $1",
                [session.id]
            )
            .then(function (result) {

                if (result.rows.length > 0) {
                    return null;
                }

                return pool.query(
                    "UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance",
                    [amount, userId]
                );
            })
            .then(function (result) {

                if (result === null) {
                    return null;
                }

                return pool.query(
                    "INSERT INTO transactions (user_id, type, amount, stripe_session_id) VALUES ($1, $2, $3, $4)",
                    [
                        userId,
                        "deposit",
                        amount,
                        session.id
                    ]
                );
            })
            .then(function () {
                console.log("Stripe deposit completed.");
            })
            .catch(function (error) {
                console.log(error);
            });
        }

        res.json({
            received: true
        });
    }
);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));



function getOdds(event, statID, statEntityID, periodID, betTypeID, sideID) {
    let allOdds = Object.values(event.odds || {});

    return allOdds.find(function (odd) {
        return (
            odd.periodID === periodID &&
            odd.betTypeID === betTypeID &&
            odd.sideID === sideID
        );
    });
}

function getMoneyline(event, periodID) {
    let away = getOdds(event, "points", "away", periodID, "ml", "away");
    let home = getOdds(event, "points", "home", periodID, "ml", "home");

    return {
        away: away ? away.bookOdds : "N/A",
        home: home ? home.bookOdds : "N/A",
    };
}

function getTotal(event, periodID) {
    let over = getOdds(event, "points", "all", periodID, "ou", "over");
    let under = getOdds(event, "points", "all", periodID, "ou", "under");

    return {
        line: over ? over.bookOverUnder : null,
        overOdds: over ? over.bookOdds : "N/A",
        underOdds: under ? under.bookOdds : "N/A",
    };
}

function getEasternDateRange() {
    let startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    return {
        startOfToday, startOfTomorrow
    };
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/games", async function (req, res) {
    try {
        let { startOfToday, startOfTomorrow } = getEasternDateRange();
        console.log("Date range:", startOfToday.toISOString(), "to", startOfTomorrow.toISOString());

        let periods = ["game", "1h", "1i", "2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i"];

        let oddIDs = [];
        periods.forEach(function (period) {
            oddIDs.push("points-away-" + period + "-ml-away");
            oddIDs.push("points-all-" + period + "-ou-over");
        });

        let options = {
            method: "GET",
            url: env.api_url,
            params: {
                apiKey: env.api_key,
                leagueID: "MLB",
                startsAfter: startOfToday.toISOString(),
                startsBefore: startOfTomorrow.toISOString(),
                oddsAvailable: true,
                includeOpposingOdds: true,
                oddIDs: oddIDs.join(","),
                limit: 20,
            },
        };

        let response = await axios.request(options);
        let events = response.data.data;

        let games = events.map(function (event) {
            let innings = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (inningNumber) {
                let periodID = inningNumber + "i";

                return {
                    inning: inningNumber,
                    moneyline: getMoneyline(event, periodID),
                    total: getTotal(event, periodID),
                };
            });

            return {
                eventID: event.eventID,
                date: event.status.startsAt,

                awayTeamName: event.teams.away.names.long,
                homeTeamName: event.teams.home.names.long,

                awayTeamID: event.teams.away.teamID,
                homeTeamID: event.teams.home.teamID,

                fullGame: {
                    moneyline: getMoneyline(event, "game"),
                    total: getTotal(event, "game"),
                },

                firstFiveInnings: {
                    moneyline: getMoneyline(event, "1h"),
                    total: getTotal(event, "1h"),
                },

                innings: innings,
            };
        });

        console.log("Games being sent to browser:");
        console.log(JSON.stringify(games, null, 2));

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

app.get("/teams", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/players", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/api/teams", async function (req, res) {
    try {
        let url =
            "https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=" +
            season +
            "&standingsTypes=regularSeason";

        let response = await axios.get(url);
        let data = response.data;
        let records = data.records || [];

        let groups = records.map(function (division) {
            let teamRecords = division.teamRecords || [];

            let teams = teamRecords.map(function (teamRecord) {
                return {
                    teamId: teamRecord.team ? teamRecord.team.id : null,
                    name: teamRecord.team ? teamRecord.team.name : "Unknown",
                    wins: teamRecord.wins,
                    losses: teamRecord.losses,
                };
            });
 
            teams.sort(function (a, b) {
                return b.wins - a.wins;
            });
 
            return {
                league: division.league ? division.league.name : "Unknown League",
                division: division.division ? division.division.name : "Unknown Division",
                teams: teams,
            };
        });

        let divisionOrder = [
            "American League East",
            "American League Central",
            "American League West",
            "National League East",
            "National League Central",
            "National League West",
        ];

        groups.sort(function (a, b) {
            return divisionOrder.indexOf(a.division) - divisionOrder.indexOf(b.division);
        });

        if (!groups || groups.length === 0) {
            res.status(404).json({
                success: false,
                error: "No teams found",
            });
        } else {
            res.json(groups);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to load teams: " + error.message,
        });
    }
});

app.get("/api/players", async function (req, res) {
    try {
        let teamFilter = req.query.team;
        let typeFilter = req.query.type;

        let groups =
            typeFilter === "hitting" || typeFilter === "pitching"
                ? [typeFilter]
                : ["hitting", "pitching"];

        let allPlayers = [];

        let PAGE_SIZE = 500;

        for (let group of groups) {
            let offset = 0;
            let totalSplits = null;

            while (totalSplits === null || offset < totalSplits) {
                let url =
                    "https://statsapi.mlb.com/api/v1/stats?stats=season&season=" +
                    season +
                    "&group=" +
                    group +
                    "&sportId=1&limit=" +
                    PAGE_SIZE +
                    "&offset=" +
                    offset;

                let response = await axios.get(url);
                let data = response.data;
                let statBlock = data.stats && data.stats[0];
                let splits = (statBlock && statBlock.splits) || [];

                totalSplits =
                    statBlock && typeof statBlock.totalSplits === "number"
                        ? statBlock.totalSplits
                        : splits.length;

                splits.forEach(function (split) {
                    let stat = split.stat || {};

                    allPlayers.push({
                        name: split.player ? split.player.fullName : "Unknown",
                        team: split.team ? split.team.name : "Unknown",
                        teamId: split.team ? split.team.id : null,
                        position:
                            group === "pitching"
                                ? "Pitcher"
                                : split.position
                                ? split.position.abbreviation
                                : "Unknown",
                        type: group,
                        avg: parseFloat(stat.avg),
                        era: parseFloat(stat.era),
                        atBats: Number(stat.atBats) || 0,
                        inningsPitched: parseFloat(stat.inningsPitched) || 0,
                        keyStat:
                            group === "pitching"
                                ? "ERA " + (stat.era !== undefined ? stat.era : "-")
                                : "AVG " + (stat.avg !== undefined ? stat.avg : "-"),
                    });
                });

                if (splits.length === 0) {
                    break;
                }

                offset += PAGE_SIZE;
            }
        }

        let filtered = allPlayers;

        if (teamFilter) {
            filtered = filtered.filter(function (player) {
                return String(player.teamId) === String(teamFilter);
            });
        }

        res.json(filtered);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Failed to load players: " + error.message,
        });
    }
});

app.get("/how-to", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/login", async function (req, res) {
    let email = req.body.email;
    let password = req.body.password;

    try {
        let result = await pool.query(
            "SELECT id, email, balance, password FROM users WHERE email = $1",
            [email]
        );

        if (result.rows.length === 0) {
            res.status(401).json({ error: "Invalid email or password." });
            return;
        }

        let user = result.rows[0];
        let passwordMatches = await bycrypt.compare(password, user.password);

        if (!passwordMatches) {
            res.status(401).json({ error: "Invalid email or password." });
            return;
        }

        res.status(200).json({
            message: "Login successful",
            user: result.rows[0]
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to login." });
    }
});


app.get("/signup", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/signup", async function (req, res) {
    try {
        let email = req.body.email;
        let password = req.body.password;
        let hashedPassword = await bycrypt.hash(password, 10);

        let result = await pool.query(
                "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email, balance",
                [email, hashedPassword]
            );

            res.status(201).json({
                message: "Account created successfully",
                user: result.rows[0]
            });
    }
    catch (error) {
        console.error(error);

        if (error.code === "23505") {
            res.status(400).json({ error: "That email already has an account." });
        }
        else {
            res.status(500).json({ error: "Unable to create account." });
        }
    }
});

app.post("/create-checkout-session", function (req, res) {

    let userId = req.body.userId;
    let amount = Number(req.body.amount);

    if (!userId) {
        res.status(400).json({
            error: "You must be logged in."
        });

        return;
    }

    if (isNaN(amount) || amount <= 0) {
        res.status(400).json({
            error: "Please enter a valid deposit amount."
        });

        return;
    }

    pool.query(
        "SELECT id, email FROM users WHERE id = $1",
        [userId]
    )
    .then(function (result) {

        if (result.rows.length === 0) {
            throw new Error("User not found.");
        }

        let user = result.rows[0];

        return stripe.checkout.sessions.create({
            payment_method_types: ["card"],

            mode: "payment",

            customer_email: user.email,

            line_items: [
                {
                    price_data: {
                        currency: "usd",

                        product_data: {
                            name: "Bet375 Deposit"
                        },

                        unit_amount: Math.round(
                            amount * 100
                        )
                    },

                    quantity: 1
                }
            ],

            metadata: {
                user_id: String(user.id)
            },

            success_url:
                req.protocol +
                "://" +
                req.get("host") +
                "/account?deposit=success",

            cancel_url:
                req.protocol +
                "://" +
                req.get("host") +
                "/account?deposit=cancel"
        });
    })
    .then(function (session) {

        res.json({
            url: session.url
        });
    })
    .catch(function (error) {

        console.log(error);

        res.status(500).json({
            error: "Unable to create deposit."
        });
    });
});

app.post("/withdraw", function (req, res) {

    let userId = req.body.userId;
    let amount = Number(req.body.amount);

    if (!userId) {
        res.status(400).json({
            error: "You must be logged in."
        });

        return;
    }

    if (isNaN(amount) || amount <= 0) {
        res.status(400).json({
            error: "Please enter a valid withdrawal amount."
        });

        return;
    }

    pool.query(
        "SELECT balance FROM users WHERE id = $1",
        [userId]
    )
    .then(function (result) {

        if (result.rows.length === 0) {
            throw new Error("User not found.");
        }

        let balance = Number(
            result.rows[0].balance
        );

        if (amount > balance) {

            res.status(400).json({
                error: "You do not have enough money."
            });

            return null;
        }

        return pool.query(
            "UPDATE users SET balance = balance - $1 WHERE id = $2 RETURNING balance",
            [amount, userId]
        );
    })
    .then(function (result) {

        if (result === null) {
            return null;
        }

        return pool.query(
            "INSERT INTO transactions (user_id, type, amount) VALUES ($1, $2, $3)",
            [
                userId,
                "withdrawal",
                amount
            ]
        );
    })
    .then(function (result) {

        if (result === null) {
            return;
        }

        res.json({
            message: "Withdrawal successful."
        });
    })
    .catch(function (error) {

        console.log(error);

        res.status(500).json({
            error: "Unable to withdraw money."
        });
    });
});


app.get("/api/transactions/:id", function (req, res) {

    let userId = req.params.id;

    pool.query(
        "SELECT type, amount, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
    )
    .then(function (result) {

        res.json(
            result.rows
        );
    })
    .catch(function (error) {

        console.log(error);

        res.status(500).json({
            error: "Unable to load transactions."
        });
    });
});


app.get("/api/account/:id", function (req, res) {

    let userId = req.params.id;

    pool.query(
        "SELECT id, email, balance FROM users WHERE id = $1",
        [userId]
    )
    .then(function (result) {

        if (result.rows.length === 0) {
            res.status(404).json({
                error: "User not found."
            });

            return;
        }

        res.json({
            user: result.rows[0]
        });
    })
    .catch(function (error) {
        console.log(error);

        res.status(500).json({
            error: "Unable to load account."
        });
    });
});

app.get("/account", function (req, res) {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});


app.get("/my-bets", function (req, res) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, hostname, function () {
    console.log(`Listening at http://${hostname}:${port}`);
});