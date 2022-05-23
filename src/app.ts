import * as fs from 'fs';
import ptn, { Tv, Movie } from 'parse-torrent-name';

fs.readFile("torrents.txt", 'ascii', (err: NodeJS.ErrnoException | null, data: string) => {
    if (err) {
        console.error(`${err.code}:${err.message}`);
        return;
    }

    const lines = data.split(/\r?\n/);
    lines.forEach((line: string) => {
        let details = ptn(line);

        // Clear every after season number: expecting <Title> s01 | <Title> s02-s03 | <Title> Season 1
        let seasonMatch = details.title.match(/s(?<short>\d{1,2}).*|season (?<long>\d{1,2}).*/i);
        if (seasonMatch) {
           const { "short": shortSeason, "long": longSeason } = seasonMatch.groups as { [key: string]: string };
           (details as Tv).season = parseInt(shortSeason ?? longSeason, 10);
        }

        details.title = details.title.replace(/s\d{1,2}.*/i, "");
        details.title = details.title.replace(/season \d{1,2}.*/i, "");

        // Clear year numbers from the end of the title: expecting <Title> 2021
        details.title = details.title.replace(/\d{4}$/i, "");
        
        // Remove excess whitespace
        details.title = details.title.trim();

        let library = "/media/server";
        let tv = details as Tv;
        let movie = details as Movie;
        if (tv.season) {
            library = `${library}/tv`;
            if (tv.episode) {
                console.info(`mv episode ${tv.episode} to ${library}/${tv.title}/Season 0${tv.season}`);
            } else {
                console.info(`mv to ${library}/${tv.title}/Season 0${tv.season}`);
            }
        } else {
            library = `${library}/movies`;
            console.info(`mv to ${library}/${movie.title}`);
        }
    });
}); 