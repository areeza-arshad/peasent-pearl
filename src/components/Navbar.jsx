// src/components/Navbar.jsx
import React, { useContext, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { FiMenu, FiX } from "react-icons/fi";
import { CiShoppingCart } from "react-icons/ci";
import { ShopContext } from "../context/ShopContext";
import { motion, AnimatePresence } from "framer-motion";

const FREE_DELIVERY_THRESHOLD = 3000;

const Navbar = () => {
  const { getCartCount, offers = [], products = [], cartItems = {} } = useContext(ShopContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentOfferIndex, setCurrentOfferIndex] = useState(0);

  const navLinks = [
    { name: "Home", path: "/" },
    { name: "Collections", path: "/collection", badge: "New" },
    { name: "Contact", path: "/contact" },
  ];

  // subtotal calculation
  const subtotal = useMemo(() => {
    let sum = 0;
    Object.entries(cartItems).forEach(([cartKey, qty]) => {
      const productId = String(cartKey).split("_")[0];
      const product = products.find((p) => String(p._id) === String(productId));
      if (!product) return;
      const price = Number(product.finalPrice ?? product.price ?? 0);
      sum += price * Number(qty || 0);
    });
    return Math.round(sum);
  }, [cartItems, products]);

  // offer messages
  // --- replace your offerMessages + rotation with this ---
const maxPercent = useMemo(() => {
  if (!Array.isArray(offers) || offers.length === 0) return 0;

  const pctOf = (o) => {
    // support both flat % and rule-based %
    if (Array.isArray(o.discountRules) && o.discountRules.length > 0) {
      const bestRule = o.discountRules.reduce(
        (m, r) => Math.max(m, Number(r?.discountPercentage) || 0),
        0
      );
      return bestRule;
    }
    return Number(o.discountPercentage) || 0;
  };

  return offers.reduce((m, o) => Math.max(m, pctOf(o)), 0);
}, [offers]);

const bannerText = maxPercent > 0
  ? `Up to ${maxPercent}% OFF 🔥`
  : null; // fall back to free-delivery msg if null


  return (
    <>
      {/* Professional Offers Bar */}
      <div className="w-full bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-10 overflow-hidden relative">
  {bannerText ? (
    <div className="flex items-center justify-center w-full">
      <span className="text-amber-700 bg-amber-100 px-2 py-1 rounded text-xs font-semibold mr-2">
        SALE
      </span>
      <div className="text-sm font-medium text-amber-900">
        {bannerText}
      </div>

      {/* Delivery threshold indicator */}
      <div className="hidden md:flex items-center ml-4 pl-4 border-l border-amber-200">
        <span className="text-xs text-amber-700">
          {/* Orders placed after 23 Febraury will be delivered after Eid */}
          Free delivery on orders above{" "}
          <span className="font-semibold">{FREE_DELIVERY_THRESHOLD} PKR</span>
        </span>
      </div>
    </div>
  ) : (
    <div className="text-sm text-amber-800 font-medium flex items-center">
      {/* <span className="hidden sm:inline">Orders placed after 23 Febraury will be delivered after Eid </span>
      <span className="sm:hidden text-center">Orders placed after 23 February will be delivered after Eid</span> */}
      <span className="hidden sm:inline">Free delivery on orders above </span>
      <span className="sm:hidden">Free delivery above </span>
      <span className="font-bold ml-1">{FREE_DELIVERY_THRESHOLD} PKR</span>
    </div>
  )}
</div>

        </div>
      </div>

      {/* Navbar itself */}
      <nav className="w-full sticky top-10 z-40 bg-[#fffdf5] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-[#D87D8F] focus:outline-none"
              >
                {isMenuOpen ? <FiX className="h-6 w-6" /> : <FiMenu className="h-6 w-6" />}
              </button>
            </div>

            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <NavLink to="/" className="mx-auto md:mx-0">
                <img src="/image/logo1.png" alt="logo" className="h-15 w-auto md:h-18 lg:h-20" />
              </NavLink>
            </div>

            {/* Desktop nav links */}
            <div className="hidden md:flex md:items-center md:justify-center md:flex-grow md:space-x-6 lg:space-x-10">
              {navLinks.map((link) => (
                <NavLink
                  key={link.name}
                  to={link.path}
                  className={({ isActive }) => `
                    relative px-3 py-2 text-sm font-medium flex items-center
                    ${isActive ? "text-amber-900" : "text-gray-700 hover:text-amber-700"}
                  `}
                >
                  {link.name}
                  {link.badge && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-semibold text-white bg-gradient-to-r from-amber-700 to-orange-700 rounded-full animate-pulse shadow-md">
                      {link.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>

            {/* Cart */}
            <div className="flex items-center">
              <NavLink
                to="/cart"
                className="group relative p-2 rounded-full hover:bg-gray-100 transition-colors duration-200"
              >
                <CiShoppingCart className="h-6 w-6 text-gray-700 group-hover:text-[#D87D8F]" />
                {getCartCount() > 0 && (
                  <span className="absolute -top-0 -right-0 w-5 h-5 bg-amber-700 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm z-10">
                    {getCartCount()}
                  </span>
                )}
              </NavLink>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <div className={`md:hidden ${isMenuOpen ? "block" : "hidden"}`}>
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.name}
                to={link.path}
                onClick={() => setIsMenuOpen(false)}
                className={({ isActive }) => `
                  flex items-center justify-between px-3 py-2 rounded-md text-base font-medium
                  ${isActive ? "bg-[#D87D8F]/10 text-amber-900" : "text-gray-700 hover:bg-gray-100"}
                `}
              >
                {link.name}
                {link.badge && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-semibold text-white bg-gradient-to-r from-amber-700 to-orange-700 rounded-full animate-pulse shadow-md">
                    {link.badge}
                  </span>
                )}
              </NavLink>
            ))}

            {/* Cart in mobile */}
            <NavLink
              to="/cart"
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
            >
              Cart
              {getCartCount() > 0 && (
                <span className="bg-[#D87D8F] text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {getCartCount()}
                </span>
              )}
            </NavLink>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;