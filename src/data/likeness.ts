/**
 * LIKENESS NOTES — factual, career-representative appearance descriptions of
 * famous public figures, written from general knowledge (the way any newspaper
 * caricaturist works). NO photos were used, scraped, or bundled; nothing here
 * is inferred from a name — every entry is a curated editorial note about a
 * man whose look is public record. One face per man, his best-known look.
 * Anyone absent keeps the hash-generic face: a wrong likeness is worse than a
 * generic one, so the unsure were left out on purpose.
 *
 * Axis dictionary (indices into Face.tsx's own tables):
 *   skin      0 palest … 7 darkest
 *   style     0 bald · 1 buzz · 2 crop · 3 fade · 4 waves · 5 curls · 6 afro · 7 longer · 8 cornrows/twists
 *   hairColor 0 near-black · 1 dark brown · 2 brown · 3 light brown · 4 gray
 *   beard     0 none · 1 stubble · 2 mustache · 3 goatee · 4 full
 *   brow      0 flat · 1 angled · 2 heavy
 *   shape     0 narrow · 1 round · 2 wide · 3 square
 */

export interface Likeness {
  skin?: number
  style?: number
  hairColor?: number
  beard?: number
  brow?: number
  shape?: number
  headband?: boolean
}

export const LIKENESS: Record<string, Likeness> = {
  // ---- the canon ----
  'Michael Jordan': { skin: 6, style: 0, beard: 0 }, // the shaved head
  'LeBron James': { skin: 6, style: 2, beard: 4, headband: true }, // the Miami headband years
  'Larry Bird': { skin: 0, style: 7, hairColor: 3, beard: 2 }, // pale, the blond mop, the mustache
  'Magic Johnson': { skin: 5, style: 5, beard: 0 }, // short 80s afro, clean
  "Shaquille O'Neal": { skin: 6, style: 0, beard: 3, shape: 2 }, // shaved, the Lakers goatee, the huge frame
  'Stephen Curry': { skin: 3, style: 2, beard: 4 }, // light brown, short crop, the trimmed beard
  'James Harden': { skin: 6, style: 3, beard: 4 }, // THE beard
  'Tim Duncan': { skin: 5, style: 2, beard: 3 }, // the quiet crop and goatee
  'Allen Iverson': { skin: 5, style: 8, beard: 3, headband: true }, // cornrows and the headband
  'Dirk Nowitzki': { skin: 0, style: 7, hairColor: 3, beard: 1 }, // the flopping blond hair
  'Yao Ming': { skin: 1, style: 2, hairColor: 0, beard: 0 },
  'Giannis Antetokounmpo': { skin: 7, style: 3, beard: 4 },
  'Nikola Jokić': { skin: 0, style: 2, hairColor: 2, beard: 1 },
  'Kobe Bryant': { skin: 5, style: 2, beard: 1 },
  'Dennis Rodman': { skin: 5, style: 1, hairColor: 4, beard: 1 }, // the buzz that changed color weekly — gray is the nod

  // ---- the rest of the star tier ----
  'Shai Gilgeous-Alexander': { skin: 5, style: 8, beard: 4 },
  'Kevin Durant': { skin: 6, style: 2, beard: 4 },
  'Karl Malone': { skin: 6, style: 3, beard: 0 },
  'Joel Embiid': { skin: 7, style: 3, beard: 4 },
  'Dwyane Wade': { skin: 6, style: 1, beard: 3 },
  'David Robinson': { skin: 5, style: 3, beard: 0 }, // the Admiral's flat-top era
  'Kawhi Leonard': { skin: 6, style: 8, beard: 3 },
  'Kevin Garnett': { skin: 6, style: 1, beard: 3 },
  'Anthony Davis': { skin: 6, style: 2, beard: 4, brow: 2 }, // the brow
  'Charles Barkley': { skin: 6, style: 0, beard: 0, shape: 2 },
  'Paul George': { skin: 5, style: 4, beard: 3 },
  'Luka Dončić': { skin: 1, style: 2, hairColor: 1, beard: 1 },
  'Hakeem Olajuwon': { skin: 7, style: 2, beard: 0 },
  'Julius Erving': { skin: 6, style: 6, beard: 0 }, // the afro
  'Victor Wembanyama': { skin: 4, style: 2, beard: 0, shape: 0 },
  'Chris Paul': { skin: 5, style: 2, beard: 4 },
  'Isaiah Thomas': { skin: 6, style: 3, beard: 4 }, // the 5'9" Celtic
  'Isiah Thomas': { skin: 4, style: 2, beard: 0 }, // the Piston, the smile
  'Tracy McGrady': { skin: 6, style: 2, beard: 1 },
  'Moses Malone': { skin: 6, style: 5, beard: 4 },
  'Kareem Abdul-Jabbar': { skin: 6, style: 1, beard: 0 }, // goggles are beyond this generator
  'Kevin McHale': { skin: 1, style: 5, hairColor: 2, beard: 0 },
  'Grant Hill': { skin: 5, style: 2, beard: 0 },
  'Dwight Howard': { skin: 6, style: 3, beard: 3, shape: 2 },
  'Elton Brand': { skin: 6, style: 1, beard: 3 },
  'Jimmy Butler': { skin: 6, style: 2, beard: 4 },
  'Manu Ginóbili': { skin: 1, style: 7, hairColor: 1, beard: 1, shape: 0 },
  'Scottie Pippen': { skin: 6, style: 1, beard: 0 },
  'Patrick Ewing': { skin: 7, style: 3, beard: 0 },
  'Clyde Drexler': { skin: 6, style: 2, beard: 2 },
  'Gary Payton': { skin: 6, style: 1, beard: 3 },
  'Alonzo Mourning': { skin: 7, style: 0, beard: 0, shape: 3 },
  'Anfernee Hardaway': { skin: 5, style: 3, beard: 0 },
  'Blake Griffin': { skin: 3, style: 2, hairColor: 3, beard: 1 },
  'Sidney Moncrief': { skin: 6, style: 5, beard: 2 },
  'Larry Nance': { skin: 6, style: 5, beard: 2 },
  'Paul Pierce': { skin: 6, style: 4, beard: 3 },
  'Jayson Tatum': { skin: 5, style: 4, beard: 1 },
  'Chris Bosh': { skin: 6, style: 2, beard: 3, shape: 0 },
  'Pau Gasol': { skin: 2, style: 7, hairColor: 1, beard: 1 },
  'Mike Conley': { skin: 5, style: 1, beard: 3 },
  'Chauncey Billups': { skin: 5, style: 2, beard: 3 },
  'DeMarcus Cousins': { skin: 6, style: 3, beard: 4 },
  'Carmelo Anthony': { skin: 5, style: 8, beard: 4, headband: true },
  'Brandon Roy': { skin: 6, style: 1, beard: 1 },
  'Kemba Walker': { skin: 6, style: 3, beard: 4 },
  'Paul Westphal': { skin: 0, style: 2, hairColor: 2, beard: 0 },
  'LaMarcus Aldridge': { skin: 6, style: 4, beard: 3 },
  'Bam Adebayo': { skin: 7, style: 2, beard: 1 },
  'Damian Lillard': { skin: 6, style: 8, beard: 4 },
  "Amar'e Stoudemire": { skin: 6, style: 1, beard: 3 },
  'Chris Webber': { skin: 6, style: 1, beard: 3 },
  'Robert Parish': { skin: 6, style: 2, beard: 0 },
  'Scottie Barnes': { skin: 6, style: 8, beard: 1 },
  'Al Horford': { skin: 4, style: 0, beard: 4 },
  'Kevin Love': { skin: 1, style: 2, hairColor: 3, beard: 4 },
  'Vince Carter': { skin: 5, style: 1, beard: 0 },
  'Anthony Edwards': { skin: 7, style: 3, beard: 1 },
  'Victor Oladipo': { skin: 7, style: 3, beard: 4 },
  'Arvydas Sabonis': { skin: 0, style: 2, hairColor: 3, beard: 0, shape: 2 },
  'Karl-Anthony Towns': { skin: 4, style: 2, beard: 3 },
  'Zion Williamson': { skin: 7, style: 3, beard: 1, shape: 2 },
  'Reggie Miller': { skin: 5, style: 1, beard: 0, shape: 0 },
  'Kristaps Porziņģis': { skin: 0, style: 2, hairColor: 3, beard: 1, shape: 0 },
  'DeMar DeRozan': { skin: 6, style: 4, beard: 4 },
  'Evan Mobley': { skin: 6, style: 2, beard: 1, shape: 0 },

  // ---- household names below the tier ----
  'Steve Kerr': { skin: 0, style: 2, hairColor: 3, beard: 0 },
  'Steve Nash': { skin: 1, style: 7, hairColor: 2, beard: 1 },
  'Russell Westbrook': { skin: 6, style: 3, beard: 3 },
  'John Stockton': { skin: 1, style: 2, hairColor: 1, beard: 0, shape: 0 },
  'Ray Allen': { skin: 6, style: 0, beard: 0 },
  'Jason Kidd': { skin: 3, style: 1, beard: 0 },
  'Klay Thompson': { skin: 3, style: 2, beard: 1 },
  'Draymond Green': { skin: 6, style: 2, beard: 1 },
  'Kyrie Irving': { skin: 5, style: 2, beard: 4 },
  'Dominique Wilkins': { skin: 6, style: 3, beard: 2 },
  'Ben Wallace': { skin: 6, style: 6, beard: 4 }, // the afro
  'Rasheed Wallace': { skin: 6, style: 2, beard: 3 },
  'Dikembe Mutombo': { skin: 7, style: 1, beard: 0 },
  'Tony Parker': { skin: 3, style: 2, beard: 1 },
  'Shawn Kemp': { skin: 6, style: 3, beard: 0 },
  'Ja Morant': { skin: 6, style: 8, beard: 1 },
  'Trae Young': { skin: 4, style: 5, beard: 1 },
  'Devin Booker': { skin: 3, style: 2, beard: 1 },
  'George Gervin': { skin: 6, style: 5, beard: 2 },
  'James Worthy': { skin: 6, style: 1, beard: 2 }, // the goggles, again, are beyond us
}
