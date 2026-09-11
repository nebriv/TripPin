/* ===========================================================================
   lines.js — the things the game says to you.

   A flat bank, per HANDOFF.md §6. No templating, no runtime composition, no
   Math.random(). The reveal picks one line by hashing the puzzle number and
   the stay index, so all five players see the same line and a refresh does not
   reroll it.

   HOW A LINE IS CHOSEN

     eligible   every tag in `when` is true of this result
     winner     longest `when` wins — the specific joke beats the generic one
     no repeats the last 40 indices are kept in localStorage and skipped

   Tags: b0 b1 b2 b3 bullseye whoExact whoPart whoNone whoOver solo thin
         dayHigh dayMid dayLow perfect beatBest streak host

   THE TWO RULES THAT ARE NOT NEGOTIABLE

   1. Never name a place. This bank is readable by anybody who can read the
      page, so a line containing a town name is a spoiler for a card that has
      not been dealt yet.
   2. Never congratulate. A good round earns dryness, suspicion or silence —
      never a compliment. "Well done" is how a game sounds when it does not
      know you.

   AND THE THREE THAT KEEP IT FROM AGEING

   3. Punch at the guess, never at the person. "That guess has left the
      neighbourhood" is about a pin. "You are bad at this" is about a friend
      who has to sit across from you at Christmas.
   4. Nothing about walking, driving or flying the distance. Every other map
      game on earth makes that joke; it is the one line that would prove this
      was built from somebody else's idea.
   5. No exclamation marks. Not one. The voice is a friend who is unimpressed
      and slightly amused, and that voice does not shout.
   =========================================================================== */

window.LINES = [

  /* ------------------------------------------------- the pin, band 0 ----
     Excellent. Do not congratulate — be suspicious instead. */

  { slot: 'stay', when: ['b0'], t: 'Right town. Suspicious.' },
  { slot: 'stay', when: ['b0'], t: 'That pin did not wander.' },
  { slot: 'stay', when: ['b0'], t: 'You did not think about that for long.' },
  { slot: 'stay', when: ['b0'], t: 'Straight to it. No hesitation. Worrying.' },
  { slot: 'stay', when: ['b0'], t: 'Either you know it, or you were lucky once.' },
  { slot: 'stay', when: ['b0'], t: 'That will not happen again.' },
  { slot: 'stay', when: ['b0'], t: 'Accurate, and deeply annoying.' },
  { slot: 'stay', when: ['b0'], t: 'The map barely moved.' },
  { slot: 'stay', when: ['b0'], t: 'That is not a guess. That is a memory.' },
  { slot: 'stay', when: ['b0'], t: 'Somebody has been reading the group chat.' },
  { slot: 'stay', when: ['b0'], t: 'Filed under: knew it.' },
  { slot: 'stay', when: ['b0'], t: 'No notes. Unfortunately.' },
  { slot: 'stay', when: ['b0'], t: 'Close enough to walk in on somebody.' },
  { slot: 'stay', when: ['b0'], t: 'Unremarkable accuracy. Carry on.' },
  { slot: 'stay', when: ['b0'], t: 'You went straight there and we all saw.' },
  { slot: 'stay', when: ['b0'], t: 'A suspiciously confident click.' },
  { slot: 'stay', when: ['b0'], t: 'Nobody is that good twice.' },
  { slot: 'stay', when: ['b0'], t: 'Correct, and quietly smug about it.' },
  { slot: 'stay', when: ['b0'], t: 'One pin. No fuss. Irritating.' },
  { slot: 'stay', when: ['b0'], t: 'That is the pin of somebody who has slept there.' },
  { slot: 'stay', when: ['b0'], t: 'Well. Yes.' },
  { slot: 'stay', when: ['b0'], t: 'You have made this look easy and we resent it.' },
  { slot: 'stay', when: ['b0'], t: 'Barely worth the map.' },
  { slot: 'stay', when: ['b0'], t: 'Landed it and moved on. Show-off.' },
  { slot: 'stay', when: ['bullseye'], t: 'There is nothing to add.' },

  /* ------------------------------------------------- the pin, band 1 ---- */

  { slot: 'stay', when: ['b1'], t: 'The right idea, badly executed.' },
  { slot: 'stay', when: ['b1'], t: 'In the region. Not in the bed.' },
  { slot: 'stay', when: ['b1'], t: 'You had it, then you second-guessed.' },
  { slot: 'stay', when: ['b1'], t: 'Respectable. Not correct.' },
  { slot: 'stay', when: ['b1'], t: 'Close, and closeness earns nothing.' },
  { slot: 'stay', when: ['b1'], t: 'You knew the country and stopped thinking.' },
  { slot: 'stay', when: ['b1'], t: 'The instinct was sound. The thumb was not.' },
  { slot: 'stay', when: ['b1'], t: 'You were circling it.' },
  { slot: 'stay', when: ['b1'], t: 'Right corner of the map, wrong everything else.' },
  { slot: 'stay', when: ['b1'], t: 'Almost. Almost is its own category.' },
  { slot: 'stay', when: ['b1'], t: 'You have located the general vibe.' },
  { slot: 'stay', when: ['b1'], t: 'A reasonable person would have said the same.' },
  { slot: 'stay', when: ['b1'], t: 'Good guess. Wrong house.' },
  { slot: 'stay', when: ['b1'], t: 'Somewhere in there was the answer you did not click.' },
  { slot: 'stay', when: ['b1'], t: 'Your first instinct was better.' },
  { slot: 'stay', when: ['b1'], t: 'Near enough to smell it. Not near enough to count.' },
  { slot: 'stay', when: ['b1'], t: 'That is the shape of somebody who nearly knew.' },
  { slot: 'stay', when: ['b1'], t: 'A near miss, which is still a miss.' },
  { slot: 'stay', when: ['b1'], t: 'You were reasoning. It nearly worked.' },
  { slot: 'stay', when: ['b1'], t: 'Not bad. Not it.' },
  { slot: 'stay', when: ['b1'], t: 'You got the continent and then relaxed.' },
  { slot: 'stay', when: ['b1'], t: 'Off by an amount you will not enjoy reading.' },
  { slot: 'stay', when: ['b1'], t: 'The right neighbourhood of the wrong idea.' },
  { slot: 'stay', when: ['b1'], t: 'Solid work. No points for solid.' },
  { slot: 'stay', when: ['b1'], t: 'You were nearly paying attention.' },

  /* ------------------------------------------------- the pin, band 2 ---- */

  { slot: 'stay', when: ['b2'], t: 'That is a different climate.' },
  { slot: 'stay', when: ['b2'], t: 'You have relocated the entire trip.' },
  { slot: 'stay', when: ['b2'], t: 'Wrong, in an interesting direction.' },
  { slot: 'stay', when: ['b2'], t: 'That is a long way to be confident.' },
  { slot: 'stay', when: ['b2'], t: 'You have missed by a whole culture.' },
  { slot: 'stay', when: ['b2'], t: 'A bold and incorrect choice.' },
  { slot: 'stay', when: ['b2'], t: 'Somewhere with completely different breakfast.' },
  { slot: 'stay', when: ['b2'], t: 'Not close. Not funny. Just wrong.' },
  { slot: 'stay', when: ['b2'], t: 'You have sent them somewhere they have never been.' },
  { slot: 'stay', when: ['b2'], t: 'No. But you committed.' },
  { slot: 'stay', when: ['b2'], t: 'That guess has left the neighbourhood.' },
  { slot: 'stay', when: ['b2'], t: 'You were thinking of somewhere else entirely.' },
  { slot: 'stay', when: ['b2'], t: 'Confidently elsewhere.' },
  { slot: 'stay', when: ['b2'], t: 'That is the wrong side of something significant.' },
  { slot: 'stay', when: ['b2'], t: 'You aimed, and then kept going.' },
  { slot: 'stay', when: ['b2'], t: 'A guess with real distance in it.' },
  { slot: 'stay', when: ['b2'], t: 'You have invented a holiday nobody took.' },
  { slot: 'stay', when: ['b2'], t: 'Different weather. Different everything.' },
  { slot: 'stay', when: ['b2'], t: 'Not the place, and not near the place.' },
  { slot: 'stay', when: ['b2'], t: 'That is somebody else\'s map.' },
  { slot: 'stay', when: ['b2'], t: 'You have put a holiday where nobody holidays.' },
  { slot: 'stay', when: ['b2'], t: 'Wrong. With conviction.' },
  { slot: 'stay', when: ['b2'], t: 'Somewhere in that direction, eventually.' },
  { slot: 'stay', when: ['b2'], t: 'You have guessed a completely different trip.' },
  { slot: 'stay', when: ['b2'], t: 'That is not the country. It is not the neighbours either.' },

  /* ------------------------------------------------- the pin, band 3 ---- */

  { slot: 'stay', when: ['b3'], t: 'Nowhere near. Genuinely nowhere near.' },
  { slot: 'stay', when: ['b3'], t: 'That is not a place anybody has slept.' },
  { slot: 'stay', when: ['b3'], t: 'An extraordinary guess.' },
  { slot: 'stay', when: ['b3'], t: 'That is the wrong half of the planet.' },
  { slot: 'stay', when: ['b3'], t: 'There is being wrong, and then there is this.' },
  { slot: 'stay', when: ['b3'], t: 'You have taken a guess and thrown it.' },
  { slot: 'stay', when: ['b3'], t: 'Nothing about that was close.' },
  { slot: 'stay', when: ['b3'], t: 'A magnificent failure.' },
  { slot: 'stay', when: ['b3'], t: 'That pin has gone on its own holiday.' },
  { slot: 'stay', when: ['b3'], t: 'Spectacular. In the wrong direction.' },
  { slot: 'stay', when: ['b3'], t: 'A guess of real ambition.' },
  { slot: 'stay', when: ['b3'], t: 'You have gone somewhere else entirely.' },
  { slot: 'stay', when: ['b3'], t: 'That is not wrong. That is elsewhere.' },
  { slot: 'stay', when: ['b3'], t: 'You have missed by more than most people travel.' },
  { slot: 'stay', when: ['b3'], t: 'That is a hemisphere problem.' },
  { slot: 'stay', when: ['b3'], t: 'No part of that was informed by anything.' },
  { slot: 'stay', when: ['b3'], t: 'You have located a completely different holiday.' },
  { slot: 'stay', when: ['b3'], t: 'That is the wrong side of something enormous.' },
  { slot: 'stay', when: ['b3'], t: 'A guess with no relationship to the truth.' },
  { slot: 'stay', when: ['b3'], t: 'You were not close, and you were not trying.' },
  { slot: 'stay', when: ['b3'], t: 'That is a long way from anything.' },
  { slot: 'stay', when: ['b3'], t: 'Committed. Catastrophic.' },
  { slot: 'stay', when: ['b3'], t: 'You have put it somewhere with no beds at all.' },
  { slot: 'stay', when: ['b3'], t: 'That is the furthest thing from a memory.' },
  { slot: 'stay', when: ['b3'], t: 'Whatever that was, it was not geography.' },

  /* ----------------------------------------------------- the people ---- */

  { slot: 'stay', when: ['whoExact'], t: 'Named them without blinking.' },
  { slot: 'stay', when: ['whoExact'], t: 'Correct. Obviously.' },
  { slot: 'stay', when: ['whoExact'], t: 'You have been listening.' },
  { slot: 'stay', when: ['whoExact'], t: 'That took no thought at all.' },
  { slot: 'stay', when: ['whoExact'], t: 'Right. Every one of them.' },
  { slot: 'stay', when: ['whoExact'], t: 'You do know who you travel with.' },
  { slot: 'stay', when: ['whoExact'], t: 'No hesitation on the faces.' },
  { slot: 'stay', when: ['whoExact'], t: 'Called the whole party.' },
  { slot: 'stay', when: ['whoExact'], t: 'Filed under: knows everyone\'s business.' },
  { slot: 'stay', when: ['whoExact'], t: 'Yes. All of them. Fine.' },
  { slot: 'stay', when: ['whoExact'], t: 'You pay more attention than you let on.' },
  { slot: 'stay', when: ['whoExact'], t: 'The guest list, exactly.' },

  { slot: 'stay', when: ['whoPart'], t: 'Half the party, half the points.' },
  { slot: 'stay', when: ['whoPart'], t: 'One of those was a guess and it shows.' },
  { slot: 'stay', when: ['whoPart'], t: 'You remembered some of them.' },
  { slot: 'stay', when: ['whoPart'], t: 'Nearly the right crowd.' },
  { slot: 'stay', when: ['whoPart'], t: 'Partly right, which is partly wrong.' },
  { slot: 'stay', when: ['whoPart'], t: 'You had the shape of the group.' },
  { slot: 'stay', when: ['whoPart'], t: 'Some of that was correct.' },
  { slot: 'stay', when: ['whoPart'], t: 'Close on the people, at least.' },
  { slot: 'stay', when: ['whoPart'], t: 'Not quite the guest list.' },
  { slot: 'stay', when: ['whoPart'], t: 'You knew who, roughly.' },
  { slot: 'stay', when: ['whoPart'], t: 'A partial memory of a real trip.' },
  { slot: 'stay', when: ['whoPart'], t: 'Somebody on that list was not there.' },

  { slot: 'stay', when: ['whoNone'], t: 'None of them. Not one.' },
  { slot: 'stay', when: ['whoNone'], t: 'Wrong crowd entirely.' },
  { slot: 'stay', when: ['whoNone'], t: 'You have put strangers in that house.' },
  { slot: 'stay', when: ['whoNone'], t: 'Nobody you named was there.' },
  { slot: 'stay', when: ['whoNone'], t: 'That trip had different people on it.' },
  { slot: 'stay', when: ['whoNone'], t: 'A clean sweep, in the wrong direction.' },
  { slot: 'stay', when: ['whoNone'], t: 'Everyone you picked was somewhere else.' },
  { slot: 'stay', when: ['whoNone'], t: 'You have misremembered the entire party.' },
  { slot: 'stay', when: ['whoNone'], t: 'Zero. On the people.' },
  { slot: 'stay', when: ['whoNone'], t: 'Not a single correct face.' },
  { slot: 'stay', when: ['whoNone'], t: 'You have invented a trip nobody went on.' },
  { slot: 'stay', when: ['whoNone'], t: 'Confident, and wrong about all of them.' },

  { slot: 'stay', when: ['whoOver'], t: 'You picked everybody. That is not a strategy.' },
  { slot: 'stay', when: ['whoOver'], t: 'Not everyone goes on everything.' },
  { slot: 'stay', when: ['whoOver'], t: 'You have invited people who were not invited.' },
  { slot: 'stay', when: ['whoOver'], t: 'That is a lot of names for one small house.' },
  { slot: 'stay', when: ['whoOver'], t: 'You have overbooked it.' },
  { slot: 'stay', when: ['whoOver'], t: 'Casting a wide net does not work here.' },
  { slot: 'stay', when: ['whoOver'], t: 'Fewer of them were there than you hoped.' },
  { slot: 'stay', when: ['whoOver'], t: 'That house does not sleep that many.' },
  { slot: 'stay', when: ['whoOver'], t: 'Ticking everybody is a confession.' },
  { slot: 'stay', when: ['whoOver'], t: 'You guessed wide, and it cost you.' },
  { slot: 'stay', when: ['whoOver'], t: 'Some of those people have never met.' },
  { slot: 'stay', when: ['whoOver'], t: 'You have added guests to somebody\'s holiday.' },

  /* ------------------------------------------- two tags, the good ones ---
     Longest `when` wins, so these beat everything above when they fire. */

  { slot: 'stay', when: ['b0', 'whoNone'], t: 'Right place. Wrong everyone.' },
  { slot: 'stay', when: ['b0', 'whoExact'], t: 'Place and people. Nothing left to say.' },
  { slot: 'stay', when: ['b0', 'whoOver'], t: 'You found the house and then filled it with strangers.' },
  { slot: 'stay', when: ['b1', 'whoNone'], t: 'Nearly the right place. None of the right people.' },
  { slot: 'stay', when: ['b1', 'whoExact'], t: 'You knew the party. The map let you down.' },
  { slot: 'stay', when: ['b2', 'whoExact'], t: 'You knew who went and had no idea where.' },
  { slot: 'stay', when: ['b2', 'whoPart'], t: 'Half the people, none of the place.' },
  { slot: 'stay', when: ['b3', 'whoNone'], t: 'Wrong continent, wrong people.' },
  { slot: 'stay', when: ['b3', 'whoExact'], t: 'You knew exactly who. You had no idea where.' },
  { slot: 'stay', when: ['b3', 'whoOver'], t: 'Wrong hemisphere, and too many names.' },
  { slot: 'stay', when: ['b3', 'whoPart'], t: 'A fragment of the party, a world away.' },

  { slot: 'stay', when: ['host', 'b3'], t: 'You were there. That is the remarkable part.' },
  { slot: 'stay', when: ['host', 'b0'], t: 'You were there, so that was the minimum.' },
  { slot: 'stay', when: ['host', 'b1'], t: 'Your own trip, and you still hedged.' },
  { slot: 'stay', when: ['host', 'b2'], t: 'You slept there and you still got this.' },
  { slot: 'stay', when: ['host', 'whoNone'], t: 'Your own trip. You named strangers.' },
  { slot: 'stay', when: ['host', 'whoExact'], t: 'The bare minimum, met.' },
  { slot: 'stay', when: ['host', 'bullseye'], t: 'You were there. You got that.' },

  { slot: 'stay', when: ['thin', 'b3'], t: 'In fairness, there was almost nothing to go on.' },
  { slot: 'stay', when: ['thin', 'b0'], t: 'From a photo and a number. Show-off.' },
  { slot: 'stay', when: ['thin', 'b1'], t: 'Not much to work with, and you nearly did.' },
  { slot: 'stay', when: ['thin', 'b2'], t: 'A bare card and a bare guess.' },

  { slot: 'stay', when: ['solo', 'whoOver'], t: 'One person went. You named several.' },
  { slot: 'stay', when: ['solo', 'whoExact'], t: 'You spotted a solo trip. Quietly impressive.' },
  { slot: 'stay', when: ['solo', 'whoNone'], t: 'Somebody went alone, and you sent a crowd.' },
  { slot: 'stay', when: ['solo', 'b0'], t: 'One person, one bed, one pin.' },

  { slot: 'stay', when: ['streak', 'b3'], t: 'The streak survives. Barely.' },
  { slot: 'stay', when: ['streak', 'b0'], t: 'Still going, and still irritating.' },
  { slot: 'stay', when: ['beatBest', 'b0'], t: 'A personal best, which you will mention.' },
  { slot: 'stay', when: ['bullseye', 'whoExact'], t: 'Everything. Fine. Enjoy it.' },

  /* --------------------------------------------------------- the day ---- */

  { slot: 'day', when: ['perfect'], t: 'You were there.' },
  { slot: 'day', when: ['perfect'], t: 'Nothing to argue with. Disappointing.' },
  { slot: 'day', when: ['perfect'], t: 'A clean sheet. Say nothing about it.' },
  { slot: 'day', when: ['perfect'], t: 'Perfect, and unbearable.' },
  { slot: 'day', when: ['perfect'], t: 'That is the whole board.' },

  { slot: 'day', when: ['dayHigh'], t: 'A good day. Do not get used to it.' },
  { slot: 'day', when: ['dayHigh'], t: 'Three rounds, no disasters.' },
  { slot: 'day', when: ['dayHigh'], t: 'Unusual competence.' },
  { slot: 'day', when: ['dayHigh'], t: 'You have peaked.' },
  { slot: 'day', when: ['dayHigh'], t: 'That will be mentioned in the chat.' },

  { slot: 'day', when: ['dayMid'], t: 'A day that happened.' },
  { slot: 'day', when: ['dayMid'], t: 'Middling. Sustainably middling.' },
  { slot: 'day', when: ['dayMid'], t: 'Neither good nor a story.' },
  { slot: 'day', when: ['dayMid'], t: 'You were present and you tried.' },
  { slot: 'day', when: ['dayMid'], t: 'Adequate. Filed.' },

  { slot: 'day', when: ['dayLow'], t: 'Tomorrow is also a day.' },
  { slot: 'day', when: ['dayLow'], t: 'Best not to dwell.' },
  { slot: 'day', when: ['dayLow'], t: 'Some days the map wins.' },
  { slot: 'day', when: ['dayLow'], t: 'A quiet day for geography.' },
  { slot: 'day', when: ['dayLow'], t: 'That happened, and now it is over.' },

  { slot: 'day', when: ['beatBest'], t: 'Your best yet, which says something about the others.' },
  { slot: 'day', when: ['beatBest'], t: 'A new high. The bar was low.' },
  { slot: 'day', when: ['streak'], t: 'Still going.' },
  { slot: 'day', when: ['streak', 'dayLow'], t: 'Kept the streak. Lost everything else.' },
  { slot: 'day', when: ['host', 'dayHigh'], t: 'Half of those were yours, so steady on.' },

  /* --------------------------------------------------- the fallbacks ----
     Empty `when` is always eligible, so a slot is never blank. */

  { slot: 'stay', when: [], t: 'Filed.' },
  { slot: 'day', when: [], t: 'Noted.' },
];
