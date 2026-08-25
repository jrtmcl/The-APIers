/*function calculateWinnings(betAmount, americanOdds) {
    if (americanOdds > 0) {
        return betAmount * (americanOdds / 100);
    } else {
        return betAmount * (100 / Math.abs(americanOdds));
    }
}

function calculatePayout(betAmount, americanOdds) {
    return betAmount + calculateProfit(betAmount, americanOdds);
}

module.exports = {
    calculateWinnings,
    calculatePayout
};*/

function findOdd(event, statEntityID, periodID, betTypeID, sideID) {
    let allOdds = Object.values(event.odds || {});

    return allOdds.find(function (odd) {
        return (
            odd.statEntityID === statEntityID &&
            odd.periodID === periodID &&
            odd.betTypeID === betTypeID &&
            odd.sideID === sideID
        );
    });
}

function getPeriodResult(event, periodID) {
    let away = findOdd(event, "away", periodID, "ou", "over");
    let home = findOdd(event, "home", periodID, "ou", "over");
    let all = findOdd(event, "all", periodID, "ou", "over");

    let ended = Boolean(
        (away && away.ended) || (home && home.ended) || (all && all.ended)
    );

    let awayRuns = away && away.ended ? Number(away.score) : null;
    let homeRuns = home && home.ended ? Number(home.score) : null;

    let totalRuns = null;
    if (all && all.ended) {
        totalRuns = Number(all.score);
    } else if (awayRuns !== null && homeRuns !== null) {
        totalRuns = awayRuns + homeRuns;
    }

    return {
        ended: ended,
        awayRuns: awayRuns,
        homeRuns: homeRuns,
        totalRuns: totalRuns,
    };
}

function gradeBet(event, bet) {
    let result = getPeriodResult(event, bet.period);

    if (!result.ended) {
        return null;
    }

    if (bet.bettype === "ml" || bet.bettype === "ml3way") {
        if (result.awayRuns === null || result.homeRuns === null) {
            return null;
        }

        if (result.awayRuns === result.homeRuns) {
            if (bet.teamtowin === "Tie") {
                return "win";
            }
            return bet.bettype === "ml3way" ? "loss" : "push";
        }

        let winningTeam = result.awayRuns > result.homeRuns ? bet.awayteam : bet.hometeam;
 
        return bet.teamtowin === winningTeam ? "win" : "loss";
    }

    if (bet.bettype === "ou") {
        if (result.totalRuns === null || bet.line === null || bet.line === undefined) {
            return null;
        }

        let line = Number(bet.line);

        if (result.totalRuns === line) {
            return "push";
        }

        let actualSide = result.totalRuns > line ? "Over" : "Under";

        return bet.teamtowin === actualSide ? "win" : "loss";
    }

    return null;
}

app.post("/api/bets", async function (req, res) {
    let {
        email,
        eventID,
        period,
        betType,
        line,
        odds,
        betAmount,
        homeTeam,
        awayTeam,
        date,
        teamToWin,
    } = req.body;

    if (!email || !eventID || !period || !betType || !teamToWin || !odds) {
        return res.status(400).json({ error: "Missing bet details." });
    }

    betAmount = Number(betAmount);

    if (!betAmount || betAmount <= 0) {
        return res.status(400).json({ error: "Please enter a valid wager amount." });
    }

    let client = await pool.connect();

    try {
        await client.query("BEGIN");

        let userResult = await client.query(
            "SELECT balance FROM users WHERE email = $1 FOR UPDATE",
            [email]
        );

        if (userResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "User not found." });
        }

        let currentBalance = Number(userResult.rows[0].balance);

        if (currentBalance < betAmount) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Insufficient balance." });
        }

        let potentialWinnings = calculatePayout(betAmount, Number(odds));
        let newBalance = currentBalance - betAmount;

        await client.query("UPDATE users SET balance = $1 WHERE email = $2", [
            newBalance,
            email,
        ]);

        let betResult = await client.query(
            `INSERT INTO bets
                (email, eventID, period, betType, line, betAmount, potentialWinnings,
                 date, homeTeam, awayTeam, odds, teamToWin, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
             RETURNING *`,
            [
                email,
                eventID,
                period,
                betType,
                line === undefined ? null : line,
                betAmount,
                potentialWinnings,
                date || null,
                homeTeam,
                awayTeam,
                String(odds),
                teamToWin,
            ]
        );

        await client.query("COMMIT");

        res.status(201).json({
            bet: betResult.rows[0],
            balance: newBalance,
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error);
        res.status(500).json({ error: "Failed to place bet." });
    } finally {
        client.release();
    }
});

async function settleBets() {
    let pendingResult = await pool.query(
        "SELECT * FROM bets WHERE status = 'pending'"
    );
 
    let pendingBets = pendingResult.rows;
 
    if (pendingBets.length === 0) {
        return { settled: 0, stillPending: 0 };
    }
 
    let eventIDs = Array.from(
        new Set(pendingBets.map(function (bet) { return bet.eventid; }))
    );
 
    let response = await axios.request({
        method: "GET",
        url: env.api_url,
        params: {
            apiKey: env.api_key,
            eventID: eventIDs.join(","),
        },
    });
 
    let events = response.data.data || [];
    let eventsById = {};
 
    events.forEach(function (event) {
        eventsById[event.eventID] = event;
    });
 
    let settledCount = 0;
 
    for (let bet of pendingBets) {
        let event = eventsById[bet.eventid];
 
        if (!event) {
            continue;
        }
 
        let outcome = gradeBet(event, bet);
 
        if (outcome === null) {
            continue;
        }
 
        if (outcome === "win") {
            await pool.query(
                "UPDATE bets SET status = 'won' WHERE id = $1",
                [bet.id]
            );
 
            await pool.query(
                "UPDATE users SET balance = balance + $1 WHERE email = $2",
                [bet.potentialwinnings, bet.email]
            );
        } else if (outcome === "push") {
            await pool.query(
                "UPDATE bets SET status = 'push' WHERE id = $1",
                [bet.id]
            );
 
            await pool.query(
                "UPDATE users SET balance = balance + $1 WHERE email = $2",
                [bet.betamount, bet.email]
            );
        } else {
            await pool.query(
                "UPDATE bets SET status = 'lost' WHERE id = $1",
                [bet.id]
            );
        }
 
        settledCount++;
    }
 
    return {
        settled: settledCount,
        stillPending: pendingBets.length - settledCount,
    };
}

app.post("/api/settle-bets", async function (req, res) {
    try {
        let result = await settleBets();
        res.json(result);
    } catch (error) {
        console.error(
            error.response ? error.response.data : error.message
        );

        res.status(500).json({
            error: "Failed to settle bets: " + error.message,
        });
    }
});

setInterval(function () {
    settleBets().catch(function (error) {
        console.error(
            "Background settlement failed:",
            error.response ? error.response.data : error.message
        );
    });
}, 60000);