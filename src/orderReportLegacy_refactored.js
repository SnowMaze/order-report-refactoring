const fs = require('fs');
const path = require('path');

// Constantes globales mal organisées
const TAX = 0.2;
const SHIPPING_LIMIT = 50;
const SHIP = 5.0;
const PREMIUM_THRESHOLD = 1000;
const LOYALTY_RATIO = 0.01;
const HANDLING_FEE = 2.5;
const MAX_DISCOUNT = 200;
const base = __dirname;
let custPath
let ordPath
let prodPath
let shipPath
let promoPath
let customers = {};
let products = {};
let shippingZones = {};
let promotions = {};
let orders = [];
let loyaltyPoints = {};
let totalsByCustomer = {};
const outputLines = [];
const jsonData = [];
let grandTotal = 0.0;
let totalTaxCollected = 0.0;
// fonction qui récupère les chemins des fichiers CSV
function getCSVPaths() {
     custPath = path.join(base, 'data', 'customers.csv');
     ordPath = path.join(base, 'data', 'orders.csv');
     prodPath = path.join(base, 'data', 'products.csv');
     shipPath = path.join(base, 'data', 'shipping_zones.csv');
     promoPath = path.join(base, 'data', 'promotions.csv');
}
function readFile(path){
    try{
        return  fs.readFileSync(path, 'utf-8');
    }catch(error){
        console.log(error)
    }
     
}
function getDatas(path){
    let data=readFile(path)
    return data.split('\n').filter(l => l.trim())
}
function fillCustomerArray(customerData){
    for (let i = 1; i < customerData.length; i++) {
        const parts = customerData[i].split(',');
        const id = parts[0];
        customers[id] = {
            id: parts[0],
            name: parts[1],
            level: parts[2] || 'BASIC',
            shipping_zone: parts[3] || 'ZONE1',
            currency: parts[4] || 'EUR'
        };
    }
}
function fillProductsArray(productData){
    for (let i = 1; i < productData.length; i++) {
        const parts = productData[i].split(',');
        try {
            products[parts[0]] = {
                id: parts[0],
                name: parts[1],
                category: parts[2],
                price: parseFloat(parts[3]),
                weight: parseFloat(parts[4] || '1.0'),
                taxable: parts[5] === 'true'
            };
        } catch (e) {
            // Skip silencieux des erreurs
            continue;
        }
    }
}
function fillShippingZonesArray(shipData){
    for (let i = 1; i < shipData.length; i++) {
        const p = shipData[i].split(',');
        shippingZones[p[0]] = {
            zone: p[0],
            base: parseFloat(p[1]),
            per_kg: parseFloat(p[2] || '0.5')
        };
    }
}
function fillPromosArray(promoData){
     for (let i = 1; i < promoData.length; i++) {
            const p = promoData[i].split(',');
            promotions[p[0]] = {
                code: p[0],
                type: p[1], // PERCENTAGE ou FIXED
                value: p[2],
                active: p[3] !== 'false'
            };
        }
}
function fillOrdersArray(orderData){
     for (let i = 1; i < orderData.length; i++) {
        const parts = orderData[i].split(',');
        try {
            const qty = parseInt(parts[3]);
            const price = parseFloat(parts[4]);

            orders.push({
                id: parts[0],
                customer_id: parts[1],
                product_id: parts[2],
                qty: qty,
                unit_price: price,
                date: parts[5],
                promo_code: parts[6] || '',
                time: parts[7] || '12:00'
            });
        } catch (e) {
            // Skip silencieux
            continue;
        }
    }
}
function fillArrays(){
    //Customer
    fillCustomerArray(getDatas(custPath))
    //Products
    fillProductsArray(getDatas(prodPath))
    //ShippingZone
    fillShippingZonesArray(getDatas(shipPath))
    //Promo
    fillPromosArray(getDatas(promoPath))
    // Lecture orders (parsing avec try/catch mais logique mélangée)
    fillOrdersArray(getDatas(ordPath))
    // Discount
    fillTotalsByCustomersArray()
}
function LoyaltyPointCalc(){
    let tmpArray = {};
    for (const o of orders) {
            const cid = o.customer_id;
            if (!tmpArray[cid]) {
                tmpArray[cid] = 0;
            }
            // Calcul basé sur le prix de commande
            tmpArray[cid] += o.qty * o.unit_price * LOYALTY_RATIO;
        }
        return tmpArray
}
function getProduct(order){
     return products[order.product_id] || {};
}
function getBasePrice(order){
    let prod = getProduct(order);
    return  prod.price !== undefined ? prod.price : order.unit_price;
}
function initTotalByCustomer(idx){
    if (!totalsByCustomer[idx]) {
            totalsByCustomer[idx] = {
                subtotal: 0.0,
                items: [],
                weight: 0.0,
                promoDiscount: 0.0,
                morningBonus: 0.0
            };
        }
}


function fillTotalsByCustomersArray(){
    for (const o of orders) {
        let cid = o.customer_id;
        initTotalByCustomer(cid)
        // Application de la promo (logique complexe et bugguée)
        const promoCode = o.promo_code;
        let discountRate = 0;
        let fixedDiscount = 0;

        if (promoCode && promotions[promoCode]) {
            const promo = promotions[promoCode];
            if (promo.active) {
                if (promo.type === 'PERCENTAGE') {
                    discountRate = parseFloat(promo.value) / 100;
                } else if (promo.type === 'FIXED') {
                    // Bug intentionnel: appliqué par ligne au lieu de global
                    fixedDiscount = parseFloat(promo.value);
                }
            }
        }
        let lineTotal = o.qty * getBasePrice(o) * (1 - discountRate) - fixedDiscount * o.qty;

        // Bonus matin (règle cachée basée sur l'heure)
        const hour = parseInt(o.time.split(':')[0]);
        let morningBonus = 0;
        if (hour < 10) {
            morningBonus = lineTotal * 0.03
            lineTotal = lineTotal * 0.03+lineTotal; // 3% de réduction supplémentaire 
        }
        totalsByCustomer[cid].subtotal += lineTotal;
        totalsByCustomer[cid].weight += (getProduct(o).weight || 1.0) * o.qty;
        totalsByCustomer[cid].items.push(o);
        totalsByCustomer[cid].morningBonus += morningBonus;
    }
}
function sortCustomerIDsArray(){
    return Object.keys(totalsByCustomer).sort();
}
function RemiseParPaliers(sub,level){
    let disc ;
     if( sub>1000 && level === 'PREMIUM'){
        disc = sub * 0.20;
     }else{
        if(sub > 500){
            disc = sub * 0.15;
        }else{
            if(sub > 100){
                disc = sub * 0.10;
            }else{  
                if(sub > 50){
                    disc = sub * 0.05;
                }
            }
        }
     }
    return disc
}
function BonusWeekend(cid,dis){
        const firstOrderDate = totalsByCustomer[cid].items[0]?.date || '';
        const dayOfWeek = firstOrderDate ? new Date(firstOrderDate).getDay() : 0;
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            dis = dis * 1.05; // 5% de bonus sur la remise
        }
        return dis
}
function GenerationRapport(){
    for (const cid of sortCustomerIDsArray()) {
        const cust = customers[cid] || {};
        const name = cust.name || 'Unknown';
        const level = cust.level || 'BASIC';
        const zone = cust.shipping_zone || 'ZONE1';
        const currency = cust.currency || 'EUR';

        const sub = totalsByCustomer[cid].subtotal;

        // Remise par paliers (duplication #1 + magic numbers)
        
        let disc = RemiseParPaliers(sub,level)

        // Bonus weekend (règle cachée basée sur la date)
        disc = BonusWeekend(cid,disc)

        // Calcul remise fidélité (duplication #2)
        let loyaltyDiscount = 0.0;
        const pts = loyaltyPoints[cid] || 0;
        if (pts > 100) {
            loyaltyDiscount = Math.min(pts * 0.1, 50.0);
        }
        if (pts > 500) {
            loyaltyDiscount = Math.min(pts * 0.15, 100.0);
        }

        // Plafond de remise global (règle cachée)
        let totalDiscount = disc + loyaltyDiscount;
        if (totalDiscount > MAX_DISCOUNT) {
            totalDiscount = MAX_DISCOUNT;
            // On ajuste proportionnellement (logique complexe)
            const ratio = MAX_DISCOUNT / (disc + loyaltyDiscount);
            disc = disc * ratio;
            loyaltyDiscount = loyaltyDiscount * ratio;
        }

        // Calcul taxe (avec gestion spéciale par produit)
        const taxable = sub - totalDiscount;
        let tax = 0.0;

        // Vérifier si tous les produits sont taxables
        let allTaxable = true;
        for (const item of totalsByCustomer[cid].items) {
            const prod = products[item.product_id];
            if (prod && prod.taxable === false) {
                allTaxable = false;
                break;
            }
        }

        if (allTaxable) {
            tax = Math.round(taxable * TAX * 100) / 100; // Arrondi à 2 décimales
        } else {
            // Calcul taxe par ligne (plus complexe)
            for (const item of totalsByCustomer[cid].items) {
                const prod = products[item.product_id];
                if (prod && prod.taxable !== false) {
                    const itemTotal = item.qty * (prod.price || item.unit_price);
                    tax += itemTotal * TAX;
                }
            }
            tax = Math.round(tax * 100) / 100;
        }

        // Frais de port complexes (duplication #3)
        let ship = 0.0;
        const weight = totalsByCustomer[cid].weight;

        if (sub < SHIPPING_LIMIT) {
            const shipZone = shippingZones[zone] || { base: 5.0, per_kg: 0.5 };
            const baseShip = shipZone.base;

            if (weight > 10) {
                ship = baseShip + (weight - 10) * shipZone.per_kg;
            } else if (weight > 5) {
                // Palier intermédiaire (règle cachée)
                ship = baseShip + (weight - 5) * 0.3;
            } else {
                ship = baseShip;
            }

            // Majoration pour livraison en zone éloignée
            if (zone === 'ZONE3' || zone === 'ZONE4') {
                ship = ship * 1.2;
            }
        } else {
            // Livraison gratuite mais frais de manutention pour poids élevé
            if (weight > 20) {
                ship = (weight - 20) * 0.25;
            }
        }

        // Frais de gestion (magic number + condition cachée)
        let handling = 0.0;
        const itemCount = totalsByCustomer[cid].items.length;
        if (itemCount > 10) {
            handling = HANDLING_FEE;
        }
        if (itemCount > 20) {
            handling = HANDLING_FEE * 2; // double pour très grosses commandes
        }

        // Conversion devise (règle cachée pour non-EUR)
        let currencyRate = 1.0;
        if (currency === 'USD') {
            currencyRate = 1.1;
        } else if (currency === 'GBP') {
            currencyRate = 0.85;
        }

        const total = Math.round((taxable + tax + ship + handling) * currencyRate * 100) / 100;
        grandTotal += total;
        totalTaxCollected += tax * currencyRate;


        outputLines.push(`Customer: ${name} (${cid})`);
        outputLines.push(`Level: ${level} | Zone: ${zone} | Currency: ${currency}`);
        outputLines.push(`Subtotal: ${sub.toFixed(2)}`);
        outputLines.push(`Discount: ${totalDiscount.toFixed(2)}`);
        outputLines.push(`  - Volume discount: ${disc.toFixed(2)}`);
        outputLines.push(`  - Loyalty discount: ${loyaltyDiscount.toFixed(2)}`);
        if (totalsByCustomer[cid].morningBonus > 0) {
            outputLines.push(`  - Morning bonus: ${totalsByCustomer[cid].morningBonus.toFixed(2)}`);
        }
        outputLines.push(`Tax: ${(tax * currencyRate).toFixed(2)}`);
        outputLines.push(`Shipping (${zone}, ${weight.toFixed(1)}kg): ${ship.toFixed(2)}`);
        if (handling > 0) {
            outputLines.push(`Handling (${itemCount} items): ${handling.toFixed(2)}`);
        }
        outputLines.push(`Total: ${total.toFixed(2)} ${currency}`);
        outputLines.push(`Loyalty Points: ${Math.floor(pts)}`);
        outputLines.push('');

        // Export JSON en parallèle (side effect)
        jsonData.push({
            customer_id: cid,
            name: name,
            total: total,
            currency: currency,
            loyalty_points: Math.floor(pts)
        });
    }
}
// Fonction principale 
function run() {
    getCSVPaths()
    fillArrays()
    // Calcul des points de fidélité (première duplication)
    loyaltyPoints = LoyaltyPointCalc()
    // Génération du rapport (mélange calculs + formatage + I/O)
    GenerationRapport()

    outputLines.push(`Grand Total: ${grandTotal.toFixed(2)} EUR`);
    outputLines.push(`Total Tax Collected: ${totalTaxCollected.toFixed(2)} EUR`);

    const result = outputLines.join('\n');
    // Side effects: print + file write
    console.log(result);

    // Export JSON surprise
    const outputPath = path.join(base, 'output.json');
    fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));

    return result;
}

// Point d'entrée
if (require.main === module) {
    run();
}

module.exports = { run };