import * as fs from 'fs';
import ptn from 'parse-torrent-name';
import { title } from 'process';

fs.readFile("torrents.txt", 'ascii', (err: NodeJS.ErrnoException | null, data: string) => {
    if (err) {
        console.error(`${err.code}:${err.message}`);
        return;
    }

    const lines = data.split(/\r?\n/);
    lines.forEach((line: string) => {
        let details = ptn(line);

        // Clean up

        // Clear every after season number: expecting <Title> s01 | <Title> s02-s03 | <Title> Season 1
        details.title = details.title.replace(/s\d+.*/i, "");
        details.title = details.title.replace(/season \d+.*/i, "");

        // Clear year numbers from the end of the title: expecting <Title> 2021
        details.title = details.title.replace(/\d{4}$/i, "");

        console.info(details.title);
    });
}); 