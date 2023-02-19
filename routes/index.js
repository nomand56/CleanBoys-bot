'use strict';
const router = require('express').Router();

const WhatsappCloudAPI = require('whatsappcloudapi_wrapper');

const Whatsapp = new WhatsappCloudAPI({
    accessToken:
        'EABLtwfrbyC0BAAfd883shoZBuNZAxjhf0pNZApxhEcBUO24f0oyVuk64uhoDrPE6v7MyMvVZACNclssAZAVXdkSqavOEO8Y8bcK3l0hZCFTdEgiLizGS8U2yUhHn0nfqIF6FrDOiEcGkmZBWSqHvyFkGQEbbmYlD0whNkcCSOSjXK7QJFCJOJB2BzxzDTeS9Ojoaw50QsJFgQZDZD',
    senderPhoneNumberId: '105055832516532',
    WABA_ID: '115541034788584',
});

const EcommerceStore = require('./../utils/ecommerce_store.js');
let Store = new EcommerceStore();
const CustomerSession = new Map();

router.get('/meta_wa_callbackurl', (req, res) => {
    console.log(req.query);
    try {
        console.log('GET: Someone is pinging me!');
        let mode = req.query['hub.mode'];
        let token = req.query['hub.verify_token'];
        let challenge = req.query['hub.challenge'];

        if (
            mode &&
            token &&
            mode === 'subscribe' &&
            'YouCanSetYourOwnToken' === token
        ) {
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    } catch (error) {
        console.error({ error });
        return res.sendStatus(500);
    }
});

router.post('/meta_wa_callbackurl', async (req, res) => {
    console.log('POST: Someone is pinging me!');
    try {
        let data = Whatsapp.parseMessage(req.body);

        if (data?.isMessage) {
            let incomingMessage = data.message;
            let recipientPhone = incomingMessage.from.phone; // extract the phone number of sender
            let recipientName = incomingMessage.from.name;
            let typeOfMsg = incomingMessage.type; // extract the type of message (some are text, others are images, others are responses to buttons etc...)
            let message_id = incomingMessage.message_id; // extract the message id

            // Start of cart logic
            if (!CustomerSession.get(recipientPhone)) {
                CustomerSession.set(recipientPhone, {
                    cart: [],
                });
            }

            let addToCart = async ({ product_id, recipientPhone }) => {
                let product = await Store.getProductById(product_id);
                if (product.status === 'success') {
                    CustomerSession.get(recipientPhone).cart.push(product);
                }
            };

            let listOfItemsInCart = ({ recipientPhone }) => {
                let total = 0;
                let products = CustomerSession.get(recipientPhone).cart;
                total = products.reduce(
                    (acc, product) => acc + product.price,
                    total
                );
                let count = products.length;
                return { total, products, count };
            };

            let clearCart = ({ recipientPhone }) => {
                CustomerSession.get(recipientPhone).cart = [];
            };
            // End of cart logic

            if (typeOfMsg === 'text_message') {
                await Whatsapp.sendSimpleButtons({
                    message: `Hi ${recipientName}, \nYou are speaking to a chatbot.\nWhat do you want to do next?`,
                    recipientPhone: recipientPhone,
                    listOfButtons: [
                        {
                            title: 'View Some Products',
                            id: 'see_categories',
                        },
                        {
                            title: 'Speak to Human',
                            id: 'speak_to_human',
                        },
                    ],
                });
            }

            if (typeOfMsg === 'radio_button_message') {
                let selectionId = incomingMessage.list_reply.id;

                if (selectionId.startsWith('product_')) {
                    let product_id = selectionId.split('_')[1];
                    let product = await Store.getProductById(product_id);
                    const {
                        price,
                        title,
                        description,
                        category,
                        image: imageUrl,
                    } = product;

                    let text = 'Product: ' + title.trim();
                    text += '\nPrice: ₹' + price;
                    text += '\nDescription: ' + description.trim();

                    await Whatsapp.sendImage({
                        recipientPhone,
                        url: imageUrl,
                        caption: text,
                    });

                    await Whatsapp.sendSimpleButtons({
                        message: `Here is the product, what do you want to do next?`,
                        recipientPhone: recipientPhone,
                        message_id,
                        listOfButtons: [
                            {
                                title: 'Add to Cart',
                                id: `add_to_cart_${product_id}`,
                            },
                            {
                                title: 'Speak to Human',
                                id: 'speak_to_human',
                            },
                            {
                                title: 'See more products',
                                id: 'see_categories',
                            },
                        ],
                    });
                }
            }

            if (typeOfMsg === 'simple_button_message') {
                let button_id = incomingMessage.button_reply.id;

                if (button_id === 'speak_to_human') {
                    // respond with a list of human resources
                    await Whatsapp.sendText({
                        recipientPhone: recipientPhone,
                        message: `Here are the contact details:`,
                    });

                    await Whatsapp.sendContact({
                        recipientPhone: recipientPhone,
                        contact_profile: {
                            addresses: [
                                {
                                    city: 'New Delhi',
                                    country: 'India',
                                },
                            ],
                            name: {
                                first_name: 'Aanya',
                                last_name: 'Sharma',
                            },
                            org: {
                                company: 'Car Service',
                            },
                            phones: [
                                {
                                    phone: '+91 1111 222 3333',
                                },
                            ],
                        },
                    });
                }
                if (button_id === 'see_categories') {
                    let categories = await Store.getAllCategories();

                    await Whatsapp.sendSimpleButtons({
                        message: `We have several categories.\nChoose one of them.`,
                        recipientPhone: recipientPhone,
                        message_id,
                        listOfButtons: categories
                            .slice(0, 3)
                            .map((category) => ({
                                title: category,
                                id: `category_${category}`,
                            })),
                    });
                }

                if (button_id.startsWith('category_')) {
                    let selectedCategory = button_id.split('category_')[1];
                    let listOfProducts = await Store.getProductsInCategory(
                        selectedCategory
                    );

                    let listOfSections = [
                        {
                            title: `Category: ${selectedCategory}`.substring(
                                0,
                                24
                            ),
                            rows: listOfProducts
                                .map((product) => {
                                    let id = `product_${product.id}`.substring(
                                        0,
                                        256
                                    );
                                    let title = product.title.substring(0, 21);
                                    let description =
                                        `${product.price}\n${product.description}`.substring(
                                            0,
                                            68
                                        );

                                    return {
                                        id,
                                        title: `${title}`,
                                        description: `₹${description}`,
                                    };
                                })
                                .slice(0, 10),
                        },
                    ];

                    await Whatsapp.sendRadioButtons({
                        recipientPhone: recipientPhone,
                        headerText: '\b',
                        bodyText: `Selected Category: ${selectedCategory}`,
                        footerText: 'Please select one of the products below:',
                        listOfSections,
                    });
                }

                if (button_id.startsWith('add_to_cart_')) {
                    let product_id = button_id.split('add_to_cart_')[1];
                    await addToCart({ recipientPhone, product_id });
                    let numberOfItemsInCart = listOfItemsInCart({
                        recipientPhone,
                    }).count;

                    await Whatsapp.sendSimpleButtons({
                        message: `Your cart has been updated.\nNumber of items in cart: ${numberOfItemsInCart}.\n\nWhat do you want to do next?`,
                        recipientPhone: recipientPhone,
                        message_id,
                        listOfButtons: [
                            {
                                title: 'Checkout',
                                id: `checkout`,
                            },
                            {
                                title: 'See More Products',
                                id: 'see_categories',
                            },
                        ],
                    });
                }

                if (button_id === 'checkout') {
                    let finalBill = listOfItemsInCart({ recipientPhone });
                    let invoiceText = `List of items in your cart:\n`;

                    finalBill.products.forEach((item, index) => {
                        let serial = index + 1;
                        invoiceText += `\n#${serial}: ${item.title} @ ₹${item.price}`;
                    });

                    invoiceText += `\n\nTotal: ₹${finalBill.total}`;

                    Store.generatePDFInvoice({
                        order_details: invoiceText,
                        file_path: `./invoice_${recipientName}.pdf`,
                    });

                    await Whatsapp.sendText({
                        message: invoiceText,
                        recipientPhone: recipientPhone,
                    });

                    await Whatsapp.sendSimpleButtons({
                        recipientPhone: recipientPhone,
                        message: `Thank you for shopping with us, ${recipientName}.\n\nYour order has been received & will be processed shortly.`,
                        message_id,
                        listOfButtons: [
                            {
                                title: 'See More Products',
                                id: 'see_categories',
                            },
                            {
                                title: 'Print My Invoice',
                                id: 'print_invoice',
                            },
                        ],
                    });

                    clearCart({ recipientPhone });
                }

                if (button_id === 'print_invoice') {
                    // Send the PDF invoice
                    await Whatsapp.sendDocument({
                        recipientPhone,
                        caption: `Car Service invoice #${recipientName}`,
                        file_path: `./invoice_${recipientName}.pdf`,
                    });

                    // Send the location of our pickup station to the customer, so they can come and pick their order
                    let warehouse = Store.generateRandomGeoLocation();

                    await Whatsapp.sendText({
                        recipientPhone: recipientPhone,
                        message: `Your order has been fulfilled. Come and pick it up, as you pay, here:`,
                    });

                    await Whatsapp.sendLocation({
                        recipientPhone,
                        latitude: warehouse.latitude,
                        longitude: warehouse.longitude,
                        address: warehouse.address,
                        name: 'Car Service',
                    });
                }
            }

            await Whatsapp.markMessageAsRead({
                message_id,
            });
        }

        return res.sendStatus(200);
    } catch (error) {
        console.error({ error });
        return res.sendStatus(500);
    }
});

module.exports = router;
