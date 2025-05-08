// Hook to add the "Generate Loot" button to the Token controls
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
                onClick: () => generateLootDialog() // Calling the loot generation function
            });
            console.log("Generate Loot button added.");
        }
    });
});

// Function to generate the loot
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

    const gold = Math.round((maxValueGP - totalValue) * 10); // leftover value in sp
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

// This opens a simple dialog to customize loot generation
function generateLootDialog() {
    new Dialog({
        title: "Generate Loot",
        content: `
            <form>
                <div class="form-group">
                    <label>Maximum Value (gp)</label>
                    <input type="number" name="maxValue" value="50" />
                </div>
                <div class="form-group">
                    <label>Max Items</label>
                    <input type="number" name="maxItems" value="5" />
                </div>
                <div class="form-group">
                    <label>Allowed Rarities</label>
                    <select name="allowedRarities" multiple>
                        <option value="common">Common</option>
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
                callback: (html) => {
                    const maxValue = parseInt(html.find('[name="maxValue"]').val());
                    const maxItems = parseInt(html.find('[name="maxItems"]').val());
                    const allowedRarities = Array.from(html.find('[name="allowedRarities"] option:checked')).map(opt => opt.value);
                    generateLoot(maxValue, maxItems, allowedRarities);
                }
            }
        }
    }).render(true);
}

// GM-Executable Macro Function
async function generateLootMacro(maxValueGP = 50, maxItems = 5, allowedRarities = ["common", "uncommon", "rare", "unique"]) {
    console.log(`Generating loot... (Max Value: ${maxValueGP}gp, Max Items: ${maxItems})`);
    await generateLoot(maxValueGP, maxItems, allowedRarities);
}

// Make sure the macro function is available for execution
game.macros.getName("generateLootMacro") ?? game.macros.create({
    name: "generateLootMacro",
    type: "script",
    command: `generateLootMacro(50, 5, ["common", "uncommon", "rare", "unique"]);`,
    img: "icons/commodities/currency/coins-assorted-mix-copper.webp",
    flags: { "pf2e-loot-generator": {} } // Optional, can be useful for future references
});
