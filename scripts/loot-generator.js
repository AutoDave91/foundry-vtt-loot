// PF2E Loot Generator Script
// Drop this file in your Foundry module folder next to module.json

Hooks.once("ready", () => {
    console.log("PF2E Loot Generator | Ready");

    Hooks.on("getSceneControlButtons", (controls) => {
        const tokenControls = controls.find(c => c.name === "token");
        if (tokenControls) {
            tokenControls.tools.push({
                name: "generateLoot",
                title: "Generate PF2E Loot",
                icon: "fas fa-coins",
                button: true,
                onClick: () => generateLootForPartyDialog()
            });
        }
    });
});

function generateLootForPartyDialog() {
    new Dialog({
        title: "Generate Party Loot",
        content: `
        <form>
          <div class="form-group">
            <label>Party Level</label>
            <input type="number" name="partyLevel" value="3" min="1" />
          </div>
          <div class="form-group">
            <label>Number of Players</label>
            <input type="number" name="partySize" value="4" min="1" />
          </div>
          <div class="form-group">
            <label>Max Number of Items</label>
            <input type="number" name="maxItems" value="6" min="1" />
          </div>
          <div class="form-group">
            <label>Allowed Rarities</label>
            <select name="allowedRarities" multiple>
              <option value="common" selected>Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
              <option value="unique">Unique</option>
            </select>
          </div>
        </form>
      `,
        buttons: {
            generate: {
                label: "Generate Loot",
                callback: async (html) => {
                    const level = parseInt(html.find('[name="partyLevel"]').val());
                    const size = parseInt(html.find('[name="partySize"]').val());
                    const maxItems = parseInt(html.find('[name="maxItems"]').val());
                    const allowedRarities = Array.from(html.find('[name="allowedRarities"] option:checked')).map(opt => opt.value);
                    const perCharTreasure = getPF2eTreasureByLevel(level);
                    const totalTreasure = perCharTreasure * size;
                    await generateLoot(totalTreasure, maxItems, allowedRarities);
                }
            }
        }
    }).render(true);
}

function getPF2eTreasureByLevel(level) {
    const gpByLevel = {
        1: 40, 2: 75, 3: 120, 4: 175, 5: 250,
        6: 350, 7: 500, 8: 700, 9: 950, 10: 1250
    };
    return gpByLevel[level] ?? (1250 + (level - 10) * 250);
}

async function generateLoot(maxValueGP, maxItems, allowedRarities) {
    const itemCompendiums = game.packs.filter(p =>
        p.metadata.system === "pf2e" &&
        p.documentName === "Item"
    );

    if (!itemCompendiums.length) {
        ui.notifications.error("No PF2E item compendiums found.");
        return;
    }

    let allItems = [];
    for (const pack of itemCompendiums) {
        try {
            await pack.getIndex();
            const filtered = pack.index.filter(e =>
                ["equipment", "consumable", "treasure"].includes(e.type) &&
                allowedRarities.includes(e.system?.traits?.rarity ?? "common")
            ).map(e => ({ ...e, pack: pack.collection }));
            allItems = allItems.concat(filtered);
        } catch (err) {
            console.warn(`Could not load compendium ${pack.collection}:`, err);
        }
    }

    if (allItems.length === 0) {
        ui.notifications.warn("No matching loot items found with selected rarity filters.");
        return;
    }

    const shuffled = allItems.sort(() => 0.5 - Math.random());
    const selected = [];
    let totalValue = 0;

    for (const entry of shuffled) {
        if (selected.length >= maxItems) break;
        const doc = await game.packs.get(entry.pack)?.getDocument(entry._id);
        const priceStr = doc?.system?.price?.value?.gp ?? "0";
        const itemValue = parseFloat(priceStr) || 0;

        if ((totalValue + itemValue) <= maxValueGP) {
            selected.push(doc.toObject());
            totalValue += itemValue;
        }
    }

    const gold = Math.round((maxValueGP - totalValue) * 10); // in sp
    if (gold > 0) {
        selected.push({
            type: "treasure",
            name: `${gold} sp`,
            system: {
                stackGroup: "coins",
                quantity: gold,
                denomination: "sp",
                value: { sp: gold }
            },
            img: "icons/commodities/currency/coins-assorted-mix-copper.webp"
        });
    }

    const lootActor = await Actor.create({
        name: "Loot Chest",
        type: "loot",
        items: selected,
        token: {
            name: "Loot",
            img: "icons/svg/treasure.svg",
            disposition: 0
        }
    });

    const scene = game.scenes.active;
    const { x = 100, y = 100 } = canvas.tokens.controlled[0]?.document ?? {};
    await scene.createEmbeddedDocuments("Token", [{
        actorId: lootActor.id,
        x, y
    }]);

    ui.notifications.info(`Generated ${selected.length} loot items worth ≤ ${maxValueGP} gp`);
}
