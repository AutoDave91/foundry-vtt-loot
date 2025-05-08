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
                onClick: () => generateLootDialog()
            });
        }
    });
});

function generateLootDialog() {
    new Dialog({
        title: "Generate Pathfinder 2e Loot",
        content: `
        <form>
          <div class="form-group">
            <label>Max Total Value (gp):</label>
            <input type="number" name="value" value="50" min="1"/>
          </div>
          <div class="form-group">
            <label>Max Items:</label>
            <input type="number" name="count" value="5" min="1" max="20"/>
          </div>
          <div class="form-group">
            <label>Allowed Rarities:</label>
            <select name="rarity" multiple>
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
                icon: "<i class='fas fa-dice'></i>",
                label: "Generate",
                callback: async (html) => {
                    const value = parseFloat(html.find('[name="value"]').val());
                    const count = parseInt(html.find('[name="count"]').val());
                    const rarities = html.find('[name="rarity"]').val();
                    generateLoot(value, count, rarities);
                }
            },
            cancel: {
                label: "Cancel"
            }
        },
        default: "generate"
    }).render(true);
}

async function generateLoot(maxValueGP, maxItems, allowedRarities) {
    const equipmentComp = game.packs.get("pf2e.equipment-srd");
    const consumableComp = game.packs.get("pf2e.consumables-srd");

    await Promise.all([equipmentComp.getIndex(), consumableComp.getIndex()]);

    const filterByRarity = entry => allowedRarities.includes(entry.system?.traits?.rarity ?? "common");

    const allItems = [
        ...equipmentComp.index.filter(e => e.type === "equipment" && filterByRarity(e)),
        ...consumableComp.index.filter(e => e.type === "consumable" && filterByRarity(e))
    ];

    const shuffled = allItems.sort(() => 0.5 - Math.random());
    const selected = [];
    let totalValue = 0;

    for (const entry of shuffled) {
        if (selected.length >= maxItems) break;
        const full = await (entry.pack ? game.packs.get(entry.pack).getDocument(entry._id) : null);
        const priceStr = full?.system?.price?.value?.gp ?? "0";
        const itemValue = parseFloat(priceStr) || 0;
        if ((totalValue + itemValue) <= maxValueGP) {
            selected.push(full.toObject());
            totalValue += itemValue;
        }
    }

    // Add some gold
    const gold = Math.round((maxValueGP - totalValue) * 10); // Convert gp to sp
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
        name: `Loot Chest`,
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
