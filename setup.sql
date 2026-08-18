SELECT 'CREATE DATABASE accounts'
WHERE NOT EXISTS 
    (SELECT FROM pg_database WHERE datname = 'accounts')\gexec

\connect accounts

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

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);