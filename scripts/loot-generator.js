async function generateLoot(maxValueGP, maxItems, allowedRarities) {
    // Find all loaded PF2E item compendiums
    const itemCompendiums = game.packs.filter(p =>
        p.metadata.system === "pf2e" &&
        p.documentName === "Item"
    );

    if (!itemCompendiums.length) {
        ui.notifications.error("No PF2E item compendiums found.");
        return;
    }

    // Load all items from the matching compendiums
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
