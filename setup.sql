DROP DATABASE IF EXISTS accounts;
CREATE DATABASE accounts;
\c accounts;

CREATE TABLE IF NOT EXISTS bets (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    betAmount INT NOT NULL,
    potentialWinnings INT NOT NULL,
    date VARCHAR(255) NOT NULL,
    homeTeam VARCHAR(255) NOT NULL,
    awayTeam VARCHAR(255) NOT NULL,
    odds VARCHAR(255) NOT NULL,
    teamToWin VARCHAR(255) NOT NULL
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    balance INT NOT NULL DEFAULT 500
);