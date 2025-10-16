const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const fs = require('fs');
const os = require('os');

module.exports = (env, argv) => {
  // Use Office Add-in dev certificates
  const certPath = path.join(os.homedir(), '.office-addin-dev-certs');
  const keyPath = path.join(certPath, 'localhost.key');
  const crtPath = path.join(certPath, 'localhost.crt');

  const httpsOptions = fs.existsSync(keyPath) && fs.existsSync(crtPath)
    ? {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(crtPath)
      }
    : true; // Fallback to auto-generated cert if Office certs not found

  const config = {
    entry: {
      taskpane: './src/taskpane/taskpane.tsx',
      commands: './src/commands/commands.ts'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: [/node_modules/, /__tests__/, /\.test\.tsx?$/]
        },
        {
          test: /\.module\.css$/,
          use: [
            'style-loader',
            {
              loader: 'css-loader',
              options: {
                esModule: false,
                modules: {
                  auto: true,
                  localIdentName: '[name]__[local]--[hash:base64:5]'
                }
              }
            }
          ]
        },
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/taskpane/taskpane.html',
        filename: 'taskpane.html',
        chunks: ['taskpane']
      }),
      new HtmlWebpackPlugin({
        template: './src/commands/commands.html',
        filename: 'commands.html',
        chunks: ['commands']
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'assets', to: 'assets', noErrorOnMissing: true }
        ]
      })
    ],
    devServer: {
      static: path.join(__dirname, 'dist'),
      port: 3000,
      hot: true,
      server: {
        type: 'https',
        options: httpsOptions
      },
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    },
    devtool: argv.mode === 'development' ? 'eval-source-map' : false
  };

  return config;
};
