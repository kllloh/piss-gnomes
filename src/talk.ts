/** Everything the gnomes, the bugs' riders and the announcer can say. Deliberately unhinged. */
import type { Faction } from './gnome';

export type SayCtx =
  | 'spot' | 'hit' | 'kill' | 'death' | 'idle' | 'capture' | 'lost' | 'cheer' | 'shout' | 'mount' | 'bugpop' | 'lowhp' | 'burn'
  | 'fire' | 'frost' | 'acid' | 'shock' | 'poison' | 'heal' | 'weapon' | 'health';

/** Lines that depend on which side you are on. Red hats are posh; blue caps are gruff. */
const SIDE: Record<Faction, Partial<Record<SayCtx, string[]>>> = {
  gnome: {
    spot: ['Intruder! In my petunias!', 'Hold still, I am watering you!', 'A blue cap! How frightfully rude!', 'Stand and be moistened!', 'I say! Trespasser!', 'Prepare to be hosed, sir!', 'You there! Get out of my garden!', 'Ooh, a target. Splendid.'],
    hit: ['Unhand my trousers!', 'Ow! That is warm!', 'I say, that is not cricket!', 'My hat! Is it wet?!', 'Oh, how vulgar!', 'Foul play! Foul wee!', 'That was my good tunic!', 'Eek! The humidity!'],
    kill: ['Rinse and repeat!', 'Got you, you soggy scoundrel!', 'Another one for the compost!', 'Splendid shot, if I say so myself!', 'Nature calls, and I answered!', 'Tidy! Next!', 'Mother always said I had a gift.', 'Gnome sweet gnome!'],
    death: ['Tell my fish I love them!', 'I regret nothing! Except the trousers!', 'Avenge my hat!', 'I see the light! It is a lawn sprinkler!', 'Blast! And I just had my beard done!', 'Farewell, cruel garden!', 'Bury me under the roses!', 'Oh, the humidity of it all!'],
    idle: ['Lovely weather for it.', 'I could murder a cup of tea.', 'Has anyone seen my other boot?', 'I have not wee-d since Tuesday. Ready to go.', 'Do you think the mushrooms are looking at us?', 'I named my bladder Reginald.', 'Is it me, or is the sky melting?', 'The trees are breathing again.', 'I just saw a colour I have never seen.', 'My nose is humming. Is that normal?', 'Pip, are you real?', 'Everything is so shiny and damp.'],
  },
  goblin: {
    spot: ['Oi! Red hat! Dinner time!', 'Found one, found one!', 'Heh heh heh. Wet bandit time.', 'Me see you! You see me? Good!', 'Splash splash splash!', 'Hold still, I am aiming with feelings!', 'Fresh meat! Dampen it!', 'Ha! You look very flammable!'],
    hit: ['Oi! That is my face!', 'Gah! Warm!', 'Who spat on me?!', 'You rude! Very rude!', 'My eyes! My lovely eyes!', 'Cheater! Cheat wee!', 'Argh, the damp!', 'I did not agree to this!'],
    kill: ['Heh heh! Soggy!', 'Down you go, puddle boy!', 'Me aim good! Me aim so good!', 'Another one for the mud!', 'You smell now! Forever!', 'I am the golden shower!', 'Mum will be so proud.', 'Stream of consciousness!'],
    death: ['Tell Mum I was a good boy!', 'Not the face! Not the... aaargh!', 'I saw my whole life! It was mostly puddles!', 'I forgive you! Not really!', 'Bury me in a bog!', 'It was the beard that did it!', 'Farewell, cruel bladder!', 'Avenge me! Or do not! Whatever!'],
    idle: ['Taste the rainbow!', 'I licked a mushroom. Bad idea. Great idea.', 'Everything is purple. Why is everything purple?', 'I can hear the colours!', 'My legs are wobbling but I did not tell them to.', 'Did that tree just wink?', 'I have a question about the moon.', 'I love you all. Also I will drench you.', 'Who put a face on that rock?', 'Why does the grass taste like Tuesday?', 'I am one with the forest. The forest is damp.', 'Pssst. The ground is made of jelly.'],
  },
};

/** Lines either side can say. {bug} is the name of the bug being ridden. */
const COMMON: Partial<Record<SayCtx, string[]>> = {
  capture: ['That zone is ours! Mine, specifically!', 'We took it! Hooray for us!', 'Flag go up! Dignity go down!', 'Zone secured! Please do not look at the puddle.', 'We own this bit now! Everyone pee on it!'],
  lost: ['They took the zone! The absolute cheek!', 'Zone lost! Somebody do something!', 'We were holding that!', 'Retake it! With pee!'],
  cheer: ['Nice shot!', 'Get him!', 'Yes! Wet him!', 'Ha ha! Drenched!', 'That is how it is done!', 'Brilliant! Disgusting! Brilliant!'],
  shout: ['AAAAAAAAH!', 'FOR THE GARDEN!', 'WEEEEEEEEE!', 'LEEEEEROY... WEE-KINS!', 'I AM A FOUNTAIN!', 'BLADDER OF FURY!', 'NOBODY EXPECTS THE SPANISH INCONTINENCE!', 'BEHOLD MY STREAM!', 'YOU CAN NOT STOP THE TRICKLE!'],
  mount: ['Giddy up, {bug}!', 'Hello {bug}, you gorgeous monster!', 'Ride, {bug}, ride!', 'I will call you {bug}, and you will be mine!', '{bug}! To the fountain!', 'This is the best day of my life!', 'Eight legs! I have eight legs now!'],
  bugpop: ['{bug}! No! Not {bug}!', 'Noooo! My beautiful {bug}!', 'Oh {bug}, you were too pure!', 'I loved that bug!', 'Goo! Everywhere! So much goo!'],
  lowhp: ['I am bleeding! No wait, that is wee.', 'Help! I am only mostly dry!', 'Medic! Or a towel!', 'I do not feel so good!', 'Somebody hold my beard!'],
  burn: ['I am on fire! This is fine! It is not fine!', 'Hot hot hot hot hot!', 'My beard! My beautiful beard!', 'Why am I warm?! WHY?!', 'Fire! Fire! Nobody pee on me! Actually yes! Pee on me!'],
  health: ['Ahh, much better!', 'Patched up! Mostly!', 'Armour on! Feeling invincible!', 'Health! Glorious health!', 'I feel brand new. Slightly soggy.', 'Is it a medkit or is it a snack? Eating it anyway.'],
  weapon: ['A piss weapon! Christmas has come early!', 'Ooh, something to throw! Or fire! Or both!', 'Heavy artillery! Of urine!', 'Finally, a proper bladder cannon!', 'This is not safe. I love it.', 'I have been waiting my whole life for this jug.'],
  fire: ['Dragon brew! My bladder is a flamethrower!', 'Ooh, spicy!', 'I am the hot sauce!'],
  frost: ['Frost elixir! I am a snow cone!', 'Brrr! It is cold coming out!', 'Ice ice baby!'],
  acid: ['Acid tonic! I am hazardous!', 'Do not touch me, I am corrosive!', 'Smells like a science experiment!'],
  shock: ['Storm draught! I am lightning!', 'Zap zap zap!', 'My hair is standing up! All of it!'],
  poison: ['Toadstool tincture! Sneaky!', 'Eww. Delicious.', 'Contagious and proud!'],
  heal: ['Nectar of life! Group hug!', 'Drink up, everyone!', 'I am a healing fountain! Mind the splash!'],
};

/** The announcer, who is having a breakdown. */
export type AnnounceCtx =
  | 'start' | 'capture' | 'lost' | 'streak3' | 'streak5' | 'streak10' | 'low50' | 'low20' | 'victory' | 'defeat' | 'bugpop' | 'filler'
  | 'derek' | 'turret' | 'airstrike' | 'nuke' | 'strike_call' | 'nuke_call'
  | 'chaos_moon' | 'chaos_rainbow' | 'chaos_turbo' | 'chaos_titan' | 'chaos_stampede' | 'chaos_zoom';

const ANNOUNCER: Record<AnnounceCtx, string[]> = {
  start: ['Welcome to the Enchanted Forest! Please keep all pee inside the arc at all times.', 'Fifty versus fifty! Bring your own bladder!', 'Ladies, gentlemen and mushrooms: let the drenching commence!', 'Gnomes! To your places! Your hats are important!'],
  capture: ['A zone has changed hands! And possibly some trousers!', 'Territory seized! The moss weeps!', 'Capture! Capture! Capture! Somebody call a judge!', 'The flag goes up! The standards go down!'],
  lost: ['Disaster! The enemy owns a zone! Do something! Anything!', 'Territory lost! Apply more pee!'],
  streak3: ['Triple drench! That is just showing off!', 'Three down! The bog is impressed!'],
  streak5: ['Five kills! You absolute fountain of destruction!', 'Rampage! Somebody get this gnome a towel! Or do not!'],
  streak10: ['TEN KILLS! YOU ARE A GOD! A DAMP, DAMP GOD!', 'UNSTOPPABLE! UNFLUSHABLE! UNBELIEVABLE!'],
  low50: ['Fifty tickets left! The forest holds its breath! And its pee!'],
  low20: ['Twenty tickets! This is it! This is the big one! Wee all fall down!'],
  victory: ['Victory! The garden is yours! Take a bath, you smell amazing!', 'Winners! The forest bows! The mushrooms applaud!'],
  defeat: ['Defeat! Your tickets ran dry. Have you tried drinking more water?', 'Well. That was damp. And disappointing.'],
  bugpop: ['A giant bug has exploded into rainbow goo! Do not lick it!', 'Another bug bites the dust! Then the dust bites back!', 'Bug down! Someone fetch a mop and a priest!'],
  filler: ['Remember: stay hydrated. Then un-hydrate.', 'Today is brought to you by the number seven and a hallucination.', 'If you can read this, you are not dreaming. Or are you.', 'I have lost track of what colour the sky should be.', 'Please do not feed the spiders. They are already feeding on you.', 'A reminder that the moon is not real. Neither am I.', 'Somewhere, a gnome is peeing on a rainbow. Is it you?', 'Gnomes are mushrooms who gave up. Discuss.', 'The management accepts no responsibility for lost beards.', 'This broadcast is being watched by seven hundred ghosts.'],
  derek: ['Warning! Derek is on his mower! He is ten times your size and he is not stopping!', 'Derek has arrived! Run! Or hide! Or get a bigger mower!', 'A farmer on a ride-on mower is loose in the forest! Please keep your gnomes off the grass!'],
  turret: ['Triple kill! Here is a turret! It pees so you do not have to! Press R!', 'Three in a row! A free turret! It has your eyes! And your bladder!'],
  airstrike: ['Five in a row! Air strike unlocked! Press R! Please clear the area of dignity!', 'Pee from above! Air strike ready! Press R!'],
  nuke: ['EIGHT KILLS! Nuclear piss authorised! Press R! The forest will not forget this!', 'You have earned the big one. Press R. Be gentle. Do not be gentle.'],
  strike_call: ['Air strike inbound! Look up! Then run!', 'Bombs away! Jugs away! Everything is away!'],
  nuke_call: ['Tactical piss nuke inbound! Everyone hold it in! Too late!', 'Nuclear pee in four seconds! Put on your tiny sunglasses!'],
  chaos_moon: ['MOON GRAVITY! Everyone is floaty! Pee upwards, nothing matters!', 'Gravity has been cancelled due to lack of interest!'],
  chaos_rainbow: ['RAINBOW RAIN! Everyone has a potion! Everyone is a wizard! Everyone is sticky!', 'Potions for all! No refunds!'],
  chaos_turbo: ['TURBO PEE! Bladders at maximum! Please do not operate heavy machinery!', 'Pressure up! Dignity down! Go go go!'],
  chaos_titan: ['TITAN MODE! Giant gnomes! The ground trembles! The petunias scream!', 'Super size me! Super size wee!'],
  chaos_stampede: ['BUG STAMPEDE! Every bug is back and they are furious!', 'The bugs have returned! Thousands! Okay, about twenty!'],
  chaos_zoom: ['DISCO SPEED! Everything is faster! Everything is louder! Everything is fine!', 'Time is a flat circle and it is spinning!'],
};

const BUG_NAMES = ['Gerald', 'Sir Legs', 'Brenda', 'Pablo', 'Kevin', 'Duchess', 'Wobbles', 'Sheila', 'Mr Mandibles', 'Doris', 'Chunk', 'Beyoncé', 'Gary', 'Tiny Dave', 'Lady Hexapod', 'Crunch', 'Bernard', 'Fluffy', 'The Colonel', 'Nigel'];

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export const randomBugName = (): string => pick(BUG_NAMES);

/** One line for a gnome of `faction` in situation `ctx`, or null if there is none. */
export function say(ctx: SayCtx, faction: Faction, vars: { bug?: string } = {}): string | null {
  const bank = [...(SIDE[faction][ctx] ?? []), ...(COMMON[ctx] ?? [])];
  if (!bank.length) return null;
  return pick(bank).replace(/\{bug\}/g, vars.bug ?? 'Gerald');
}

export function announce(ctx: AnnounceCtx): string {
  return pick(ANNOUNCER[ctx]);
}

/** How often each situation actually produces a line (so the forest is chatty but not unbearable). */
export const SAY_CHANCE: Record<SayCtx, number> = {
  spot: 0.3, hit: 0.07, kill: 0.5, death: 0.35, idle: 1, capture: 0.8, lost: 0.5, cheer: 0.25, shout: 1, mount: 0.9, bugpop: 0.9,
  lowhp: 0.35, burn: 0.3, weapon: 0.9, health: 0.6, fire: 0.9, frost: 0.9, acid: 0.9, shock: 0.9, poison: 0.9, heal: 0.9,
};
