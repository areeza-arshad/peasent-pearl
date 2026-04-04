// src/context/ShopContext.jsx
import React, { createContext, useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export const ShopContext = createContext();

const LOCAL_KEY = "guestCart_v2";

const ShopContextProvider = (props) => {
  const currency = "PKR";
  const delivery_fee = 250;
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [categories, setCategories] = useState([]);

  // CART: use an array of items { productId, variantId, variantColor, quantity }
  const [cartItems, setCartItems] = useState(() => {
    try {
      // Try new schema first
      const rawNew = localStorage.getItem(LOCAL_KEY);
      if (rawNew) {
        const parsed = JSON.parse(rawNew);
        if (Array.isArray(parsed)) return parsed.filter((it) => it?.productId && (it?.quantity || 0) > 0);
      }

      // Backfill from old schema (guestCart_v1)
      const rawOld = localStorage.getItem("guestCart_v1");
      if (!rawOld) return [];
      const old = JSON.parse(rawOld);
      if (!Array.isArray(old)) return [];

      return old
        .map((it) => {
          const clean = {
            productId: String(it.productId),
            variantId: it.variantId ? String(it.variantId) : null,
            variantColor: it.variantColor || null,
            quantity: Math.max(0, Number(it.quantity) || 0),
            // NEW: defaults
            engravingFirstName: "",
            engravingLastName: "",
          };
          return { ...clean, cartKey: makeCartKey(clean) };
        })
        .filter((it) => it.productId && it.quantity > 0);
    } catch {
      return [];
    }
  });

  const makeCartKey = ({
    productId,
    variantId,
    variantColor,
    engravingFirstName = "",
    engravingLastName = "",
  }) => {
    const v = variantId || variantColor || "default";
    const fn = String(engravingFirstName || "").trim().toLowerCase();
    const ln = String(engravingLastName || "").trim().toLowerCase();
    return `${productId}__${v}__fn_${fn}__ln_${ln}`;
  };

  // -----------------------
  // Data fetching
  // -----------------------
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productRes, offerRes, categoryRes] = await Promise.all([
          axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/product/list`),
          axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/offer/active`),
          axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/category/list`),
        ]);

        const productList = productRes.data.products || [];
        console.log(productList)
        const activeOffers = offerRes.data.offers || [];
        const categoryList = categoryRes.data.categories || [];

        const canonical = (s) => {
          if (!s && s !== "") return "";
          let str = String(s || "").trim().toLowerCase();
          str = str.replace(/[\s\-_]+/g, " ");
          if (str.endsWith("ies")) str = str.replace(/ies$/, "y");
          else if (str.endsWith("ses")) str = str.replace(/ses$/, "s");
          else if (str.endsWith("es")) str = str.replace(/es$/, "");
          else if (str.endsWith("s")) str = str.replace(/s$/, "");
          return str;
        };

        const findCategoryByIdOrName = (idOrName) => {
          if (!idOrName) return null;
          if (/^[0-9a-fA-F]{24}$/.test(String(idOrName).trim())) {
            const byId = categoryList.find((c) => String(c._id) === String(idOrName).trim());
            if (byId) return byId;
          }
          const target = canonical(idOrName);
          return categoryList.find((c) => canonical(c.name || "") === target) || null;
        };

        const findProductCategoryIdOrName = (product) => {
          if (!product) return { id: null, name: null, subcategory: null };
          if (product.category && typeof product.category === "object") {
            return { 
              id: product.category._id || null, 
              name: product.category.name || null, 
              subcategory: product.subcategory || null 
            };
          }
          if (product.category && typeof product.category === "string") {
            const val = product.category.trim();
            if (/^[0-9a-fA-F]{24}$/.test(val)) return { id: val, name: null, subcategory: product.subcategory || null };
            return { id: null, name: val, subcategory: product.subcategory || null };
          }
          if (product.categoryId) return { id: String(product.categoryId), name: product.categoryName || null, subcategory: product.subcategory || null };
          if (product.categoryName) return { id: null, name: String(product.categoryName), subcategory: product.subcategory || null };
          if (product.subcategory) return { id: null, name: product.subcategory || null, subcategory: product.subcategory || null };
          return { id: null, name: null, subcategory: product.subcategory || null };
        };

        const now = new Date();
        const validOffers = (activeOffers || []).filter((o) => {
          if (!o || !o.active) return false;
          if (!o.expiresAt) return true;
          const exp = new Date(o.expiresAt);
          return exp > now;
        });

        const pickRulePercent = (offer, difficulty = "easy") => {
          const d = canonical(difficulty || "easy");
          const rules = Array.isArray(offer?.discountRules) ? offer.discountRules : [];
          const rule = rules.find((r) => canonical(r?.difficulty) === d);
          const pct = Number(rule?.discountPercentage);
          return Number.isFinite(pct) && pct > 0 ? pct : 0;
        };

        const updatedProducts = productList.map((product) => {
          // Preserve all original product data including videos
          const productCopy = { ...product };
          
          const { id: productCategoryId, name: productCategoryName, subcategory: productSubcategory } =
            findProductCategoryIdOrName(product);

          const prodCatCanon = canonical(productCategoryName || "");
          const prodSubCanon = canonical(productSubcategory || "");
          const difficulty = product.difficulty || "easy";

          const applicable = (validOffers || []).filter((offer) => {
            if (!offer) return false;
            if (!offer.categories || offer.categories.length === 0) return true;

            for (const catRef of offer.categories) {
              const catDoc = typeof catRef === "object" && catRef !== null ? catRef : findCategoryByIdOrName(catRef);
              const offerCatName = canonical(catDoc?.name || catRef || "");

              if (productCategoryId && catDoc && String(catDoc._id) === String(productCategoryId)) return true;
              if (prodCatCanon && offerCatName && prodCatCanon === offerCatName) return true;
              if (prodSubCanon && offerCatName && prodSubCanon === offerCatName) return true;

              if (offer.applyToSubcategories && catDoc && Array.isArray(catDoc.subcategories)) {
                const subcatsCanon = catDoc.subcategories.map((s) => canonical(s));
                if (subcatsCanon.includes(prodCatCanon) || subcatsCanon.includes(prodSubCanon)) return true;
              }
            }
            return false;
          });

          let bestOffer = null;
          let bestPercent = 0;
          for (const off of applicable) {
            const p = pickRulePercent(off, difficulty);
            if (p > bestPercent) {
              bestPercent = p;
              bestOffer = off;
            }
          }

          const basePrice = Number(product.price || 0);
          const finalPrice = Math.round(basePrice * (1 - bestPercent / 100));

          // Return the product with all original data PLUS the calculated fields
          return {
            ...productCopy, // This preserves videos, variants, images, etc.
            finalPrice,
            appliedOffer: bestOffer || null,
            appliedDiscountPercent: bestPercent,
          };
        });

        setProducts(updatedProducts);
        setOffers(validOffers);
        setCategories(categoryList);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoadingProducts(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist cart to localStorage whenever it changes
  useEffect(() => {
    try {
      const toSave = cartItems
        .filter((it) => it && it.productId && it.quantity > 0)
        .map((it) => ({
          productId: it.productId,
          variantId: it.variantId,
          variantColor: it.variantColor,
          quantity: Number(it.quantity),
          engravingFirstName: it.engravingFirstName || "",
          engravingLastName: it.engravingLastName || "",
          cartKey: it.cartKey || makeCartKey(it),
        }));
      localStorage.setItem(LOCAL_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn("Failed to save cart:", e);
    }
  }, [cartItems]);

  // -----------------------
  // CART API
  // -----------------------
  const addToCart = (
    productId,
    qty = 1,
    variantId = null,
    variantColor = null,
    personalization = {}
  ) => {
    if (!productId) return;
    const payload = {
      productId: String(productId),
      variantId: variantId ? String(variantId) : null,
      variantColor: variantColor || null,
      quantity: Math.max(1, Number(qty) || 1),
      engravingFirstName: personalization.engravingFirstName || "",
      engravingLastName: personalization.engravingLastName || "",
    };
    const key = makeCartKey(payload);

    setCartItems((prev) => {
      const idx = prev.findIndex((it) => it.cartKey === key);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + payload.quantity };
        return copy;
      }
      return [...prev, { ...payload, cartKey: key }];
    });
  };

  const updateQuantityByKey = (cartKey, newQuantity) => {
    setCartItems((prev) =>
      prev.map((it) =>
        it.cartKey === cartKey
          ? { ...it, quantity: Math.max(1, Number(newQuantity) || 1) }
          : it
      )
    );
  };

  const removeFromCartByKey = (cartKey) => {
    setCartItems((prev) => prev.filter((it) => it.cartKey !== cartKey));
  };

  // Backward-compatible methods (update the FIRST matching line)
  const updateQuantity = (productId, variantId, newQuantity) => {
    setCartItems((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex(
        (it) =>
          it.productId === String(productId) &&
          String(it.variantId) === String(variantId)
      );
      const q = Math.max(0, Number(newQuantity) || 0);
      if (idx >= 0) {
        if (q <= 0) copy.splice(idx, 1);
        else copy[idx].quantity = q;
      }
      return copy;
    });
  };

  const removeFromCart = (productId, variantId) => {
    setCartItems((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex(
        (it) =>
          it.productId === String(productId) &&
          String(it.variantId) === String(variantId)
      );
      if (idx >= 0) copy.splice(idx, 1);
      return copy;
    });
  };

  const clearCart = () => {
    setCartItems([]);
    localStorage.removeItem(LOCAL_KEY);
  };

  const getCartCount = () =>
    cartItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  // -----------------------
  // Provider value
  // -----------------------
  const value = {
    products,
    loadingProducts,
    currency,
    offers,
    setOffers,
    categories,
    setCategories,
    delivery_fee,
    // cart:
    addToCart,
    cartItems,
    updateQuantity,          // backward-compatible
    removeFromCart,          // backward-compatible
    updateQuantityByKey,     // precise (recommended)
    removeFromCartByKey,     // precise (recommended)
    getCartCount,
    navigate,
    clearCart,
  };

  return <ShopContext.Provider value={value}>{props.children}</ShopContext.Provider>;
};

export default ShopContextProvider;