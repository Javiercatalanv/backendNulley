# Data folder

This folder holds the **Scimago Journal Rank CSV** used by the SJR Resolver to
attach a quartile (Q1–Q4) to each publication.

## How to get the file

1. Visit https://www.scimagojr.com/journalrank.php
2. Click the **"Download data"** button at the top right.
3. Save the downloaded file in this folder, renamed to:

   `scimago_journal_rank.csv`

## When to refresh it

Scimago publishes a new edition once a year (usually around April/May with the
previous year's data). Replace the CSV after each release.

## Custom path

If you prefer to store the CSV elsewhere, set the `SCIMAGO_CSV_PATH` env var
to its absolute path in your `.env` file.
