const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema({
  // Store Information (Step 3)
  url: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  customDomain: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  premiumDomainStatus: {
    type: String,
    enum: ['not_requested', 'pending', 'active', 'failed'],
    default: 'not_requested',
  },
  premiumDomainRequestedAt: Date,
  premiumDomainActivatedAt: Date,
  premiumDomainError: String,
  storeName: {
    type: String,
    required: true,
  },
  logo: {
    type: String,
    default: "",
  },
  whatsappNumber: {
    type: String,
    required: true,
  },
  currency: {
    type: String,
    default: "NGN",
  },
  
  // Business Details (Step 1)
  businessName: {
    type: String,
    required: true,
  },
  businessType: {
    type: String,
    required: true,
  },
  numberOfEmployees: {
    type: String,
    enum: ["1-5", "6-10", "11-20", "21-50", "50+"],
    default: "1-5",
  },
  monthlyOrders: {
    type: String,
    enum: ["0-10", "11-50", "51-100", "101-500", "500+"],
    default: "0-10",
  },
  referralSource: {
    type: String,
    default: "",
  },
  
  // Goals (Step 2)
  goals: {
    type: [String],
    default: [],
  },
  
  // New fields for settings
  businessDescription: {
    type: String,
    default: "",
  },
  
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
  },
  
  socialLinks: {
    facebook: String,
    instagram: String,
    twitter: String,
    tiktok: String,
    youtube: String,
    website: String,
  },
  
  businessHours: [{
    day: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    },
    open: Boolean,
    openTime: String,
    closeTime: String,
  }],
  
  // SEO Settings
  seo: {
    title: String,
    description: String,
    keywords: String,
    ogImage: String,
  },
  
  // Checkout Options
  checkoutOptions: {
    productDelivery: {
      enableDelivery: {
        type: Boolean,
        default: true,
      },
      enablePickup: {
        type: Boolean,
        default: true,
      },
      deliveryLocations: [{
        name: String,
        price: Number,
      }],
    },
    paymentOptions: {
      bankTransfer: {
        enabled: {
          type: Boolean,
          default: false
        },
        accounts: {
          type: [{
            accountName: {
              type: String,
              trim: true,
              required: true
            },
            accountNumber: {
              type: String,
              trim: true,
              required: true
            },
            bankName: {
              type: String,
              trim: true,
              required: true
            }
          }],
          default: []
        },
        accountInfo: {
          type: String,
          default: ''
        }
      },
      cashOnDelivery: {
        enabled: {
          type: Boolean,
          default: false
        }
      },
      manualPayment: {
        enabled: {
          type: Boolean,
          default: false
        },
        instructions: {
          type: String,
          default: ''
        }
      }
    },
    whatsapp: {
      enabled: {
        type: Boolean,
        default: true
      }
    },
    guestCheckout: {
      enabled: {
        type: Boolean,
        default: true
      },
      autoSaveCustomer: {
        type: Boolean,
        default: true
      },
      requireAccount: {
        type: Boolean,
        default: false
      }
    },
  },
  
  // Store Customization
  customization: {
    template: {
      type: String,
      enum: ['simple', 'elegant', 'compact', 'modern', 'retro'],
      default: 'simple',
    },
    theme: String,
    colors: {
      primary: String,
      secondary: String,
      accent: String,
    },
    layout: String,
    hero: {
      title: String,
      subtitle: String,
    },
    banner: {
      enabled: {
        type: Boolean,
        default: false,
      },
      imageUrl: String,
    },
    announcements: {
      enabled: {
        type: Boolean,
        default: false,
      },
      text: String,
      backgroundColor: String,
      textColor: String,
    },
    layoutOptions: {
      showHero: {
        type: Boolean,
        default: true,
      },
      showCategories: {
        type: Boolean,
        default: true,
      },
      showSearch: {
        type: Boolean,
        default: true,
      },
      showSocialLinks: {
        type: Boolean,
        default: true,
      },
    },
  },
  
  // Analytics
  analytics: {
    views: {
      type: Number,
      default: 0,
    },
    orders: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    },
  },
  
  // Store Managers
  managers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  }],
  
  managerPermissions: {
    type: Map,
    of: [String],
  },
  
  // Booking Settings
  bookingSettings: {
    enabled: {
      type: Boolean,
      default: false,
    },
    disableProducts: {
      type: Boolean,
      default: false,
    },
  },
  
  // Relationship
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Store", storeSchema);
