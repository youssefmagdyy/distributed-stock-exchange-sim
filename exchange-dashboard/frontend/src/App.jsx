import { useState, useEffect } from 'react';
import OrderBookChart from './components/OrderBookChart';
import PriceEvolutionChart from './components/PriceEvolutionChart';

const App = () => {
  const [orderBookData, setOrderBookData] = useState({});
  const [priceData, setPriceData] = useState({});
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:3003'); // After port forwarding the market-data-publisher service
    socket.onopen = () => {
      console.log('Connected to WebSocket server');
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'order_book_update') {
        const { symbol, orderBook } = message.payload;
        setOrderBookData((prevData) => ({
          ...prevData,
          [symbol]: orderBook
        }));
      }

      if (message.type === 'execution_update') {
        const { symbol, execution } = message.payload;
        const { ask, bid, timestamp } = execution;
        setPriceData((prevData) => {
          const prevSymbolData = prevData[symbol] || {
            timestamps: [],
            askPrices: [],
            bidPrices: []
          };

          return {
            ...prevData,
            [symbol]: {
              timestamps: [...prevSymbolData.timestamps, timestamp],
              askPrices: [...prevSymbolData.askPrices, ask.price],
              bidPrices: [...prevSymbolData.bidPrices, bid.price]
            }
          };
        });
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  return (
    <div className='container'>
        <div>
      <h1>Stock Exchange Dashboard</h1>
      <div>
        <label htmlFor="symbol">Select Stock Symbol: </label>
        <select id="symbol" value={selectedSymbol} onChange={(e) => {setSelectedSymbol(e.target.value)}}>
          <option value="AAPL">AAPL</option>
          <option value="GOOGL">GOOGL</option>
          <option value="MSFT">MSFT</option>
          <option value="AMZN">AMZN</option>
        </select>
      </div>
      </div>
      <OrderBookChart orderBookData={orderBookData[selectedSymbol] || { asks: [], bids: [] }} />
      <PriceEvolutionChart priceData={priceData[selectedSymbol] || { timestamps: [], askPrices: [], bidPrices: [] }} />
    </div>
  );
};

export default App;
