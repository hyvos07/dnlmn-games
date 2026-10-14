/** Original curated vocabulary: ordinary lowercase English, without downloads or dictionaries. */
export const WORDS = `
ant ape ash bat bay bee bow box bud bug bus cap car cat cob cup cut day den dew dig dog dot dry
ear egg elf elm eye fan far fig fin fit fly fog fox fur gap gem get gum hat hay hen hid hip hop
hot ice ink ivy jar jaw jet job joy jug key kit lap leg lid lip log low map mat mix mud net new
nod nut oak old orb owl pan paw pen pet pie pig pin pit pot rag ram rat red rib rim rod row rug
run rye sad sap sea set sew shy sky son sun tan tap tea ten tie tin tip toe top toy try tub tug
van vat vow war wax web wet wig win wit wok yes yet zip zoo
arch army aunt baby bark barn base beam bear bell bird blue boat bone book bowl bull bush calm
camp cane cape cave clay coat cold cook cool corn crab crow dawn deer desk door dove drum duck
dust earn east echo face farm fast fern fire fish flag foam fork frog gale gate gift glow goat
gold gray grin grow hand hare harp hawk heat hero hill home hope horn hour hunt idea iron jade
keep kite lake lamb lamp land leaf leap lens life lime lion lock loud love luck mage mask maze
meal melt mint mist moon moth nest nice noon note oath open palm path pear pine pink play plum
pond pool rain reed ring rise road rock root rose ruby rune sail salt sand seal seed ship silk
slow snow soap soft song soul star stem step stop swan tail tale tank tent thaw tide time tree
true tune turn twin vine vote walk warm wave west wild wind wing wolf wood word yarn year
acorn alarm amber angel apple arrow beach beard beast berry blade bloom board brave bread brick
brook brown brush cabin camel candy cedar chain chair charm chase chess chest chief choir clean
clear cliff cloud coral cover craft crane creek crown dance dream drift eagle earth ember empty
fairy feast field flame flock flour flute focus force forge fresh frost giant glass globe grace
grain grape grass green grove guard heart hedge honey horse house human ivory jewel judge knife
known large laugh light lilac lucky magic maple march medal mercy metal might money month
mouse music night noble north ocean olive orbit otter peace peach pearl petal piano pilot plain
plant plate plume point power pride proof proud quick quiet raven reach river robin royal ruler
saint scale scarf scout shade sharp sheep shell shine shore siege skill slate sleep small smile
smoke snail snake spark spear spell spice spine split spoon spray stack stage stand steel stone
storm story straw sugar sweet table thorn tiger torch tower trail train trout trunk trust tulip
under unity value vivid voice water watch wheat white whole world worth young zebra
admire anchor answer anthem archer autumn banner basket beacon beauty beetle birch border bottle
branch breeze bridge bright bronze bubble burden butter candle canyon carpet castle cavern chance
charge cherry circle copper cotton cousin cradle dagger danger desert dragon drawer dreams echoed
elixir falcon family farmer father feather flower forest frozen garden gentle ginger golden gravel
ground harbor healer helmet hidden hollow honest hunter island keeper kettle kitten knight ladder
leader legend letter little living lizard lonely marble market meadow memory mirror moment
monkey mother nature needle orange packet palace parade parent pebble pencil pepper person pillar
planet player pocket poetry pollen portal potion pretty purple rabbit reason rescue ribbon ripple
rocket sacred safety sailor secret shadow shield silver simple singer smooth spirit spring square
stable statue stream strong summer summit sunset temple tender throne timber travel tunnel turtle
valley velvet violet wander weapon whisper window winter wisdom wonder yellow
ancient another balance beloved blossom cabbage captain careful chamber chapter charity chimney
citadel clarity crystal curtain dancing deepest delight diamond distant evening fiction firefly
flowing freedom garment glacier glowing harmony harvest healing helping horizon journey kingdom
landing lattice leather library lantern lanterns melody message mineral morning mountain
mystery opening orchard outside patient passage pasture pattern perfect phoenix pioneer playing
promise protect purpose radiant rainbow reading rebuild recover refugee rejoice retreat roaming
running scholar shelter silence soldier sparkle special splendor station sunrise teacher thunder
unicorn unknown village waiting warrior weather welcome western winding wishing writing
absolute abundant adventure airborne alphabet ambition amethyst ancestor anywhere approach assembly
backbone balanced barefoot blessing bluebird boundary bracelet building cardinal champion cheerful
children complete courage daylight devotion discover dreadful elephant enchanted faithful familiar
festival firewood flourish fortress fragrant friendly generous graceful guardian hillside infinite
language lavender learning luminous magician midnight moonbeam movement northern patience peaceful
precious presence progress question raindrop reminder restless sapphire scenery seashore shoulder
snapshot snowdrop southern spacious starfall starlight strength surprise twilight universe victory
wildfire woodland yearning
adventure afternoon beautiful butterfly celebrate challenge character courtyard curiosity dangerous
different direction discovery evergreen footsteps forgotten gathering happiness heartwood important
knowledge landscape lightning mountains necessary nightfall nightmare parchment plentiful porcupine
rainstorm recording returning sanctuary scattered sensitive shattered shoreline signature snowflake
something somewhere songbirds starshine steadfast storybook sunflower trembling waterfall welcoming
whimsical wonderful yesterday
background battlement blackberry brightness chandelier compassion courageous dragonfire earthbound
enchantment everything expedition firelight foundation friendship generosity grasshopper heartstone
imagination impossible incredible invitation lighthouse mysterious nightshade remarkable resistance
silhouette stronghold strawberry summertime thoughtful tournament understand wildflower wilderness
celebration candlelight consequence constellation determination everlasting fascination generations
illuminated inspiration magnificent opportunity remembrance restoration storytelling thunderbolt
transformation underground unbreakable watchkeeper
`
  .trim()
  .split(/\s+/);

/** One length schedule for every difficulty, based only on unpaused simulation seconds. */
export function wordLengthRange(elapsed: number): { min: number; max: number } {
  const max = Math.min(11, 4 + Math.floor(Math.max(0, elapsed) / 55));
  return { min: Math.min(7, Math.max(3, max - 3)), max };
}

export function wordsConflict(first: string, second: string): boolean {
  return first.startsWith(second) || second.startsWith(first);
}

/** Returning null defers the spawn instead of creating an ambiguous or duplicate word. */
export function chooseWord(
  elapsed: number,
  occupied: readonly string[],
  random: () => number,
): string | null {
  const { min, max } = wordLengthRange(elapsed);
  const eligible = WORDS.filter(
    (word) =>
      word.length >= min &&
      word.length <= max &&
      occupied.every((active) => !wordsConflict(word, active)),
  );
  return eligible[Math.floor(random() * eligible.length)] ?? null;
}
